/**
 * E2B remote sandbox adapter (Phase 130): runs commands in E2B cloud
 * sandboxes over its REST API. The HTTP layer is injectable so tests can
 * verify the request contract against a local mock IdP-style server.
 * No-throw: HTTP failures, missing API keys, and timeouts are results.
 */

import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const E2B_SANDBOX_ID = 'e2b-remote'

export interface E2BOptions {
  /** E2B API key (default: E2B_API_KEY env). */
  apiKey?: string
  baseUrl?: string
  templateId?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

interface SandboxHandle {
  id: string
  createdAt: number
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': apiKey }
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly id = E2B_SANDBOX_ID
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly templateId: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private handle: SandboxHandle | null = null
  private lastError: string | null = null

  constructor(options: E2BOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY
    this.baseUrl = options.baseUrl ?? 'https://api.e2b.dev'
    this.templateId = options.templateId ?? 'forge-sandbox'
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  info(): ReturnType<SandboxProvider['info']> {
    const available = this.apiKey !== undefined
    const info: ReturnType<SandboxProvider['info']> = {
      id: E2B_SANDBOX_ID,
      platform: 'e2b-cloud',
      capabilities: ['execute', 'remote', 'cloud', 'isolated-per-run'],
      available,
    }
    if (!available) info.unsupportedReason = 'E2B_API_KEY is not set'
    return info
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey !== undefined
  }

  /** POST /sandboxes - create (once; reused for subsequent commands). */
  private async ensureSandbox(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    if (this.handle !== null) return { ok: true, id: this.handle.id }
    if (this.apiKey === undefined) return { ok: false, error: 'E2B_API_KEY is not set' }
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/sandboxes`, {
        method: 'POST',
        headers: jsonHeaders(this.apiKey),
        body: JSON.stringify({ templateId: this.templateId, timeoutMs: this.timeoutMs }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return {
          ok: false,
          error: `sandbox create failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
        }
      }
      const parsed = (await response.json()) as { sandboxId?: string }
      if (typeof parsed.sandboxId !== 'string' || parsed.sandboxId.length === 0) {
        return { ok: false, error: 'sandbox create returned no sandboxId' }
      }
      this.handle = { id: parsed.sandboxId, createdAt: Date.now() }
      return { ok: true, id: this.handle.id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** POST /sandboxes/{id}/commands - mapped into SandboxExecutionResult. */
  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    const sandbox = await this.ensureSandbox()
    if (!sandbox.ok) {
      this.lastError = sandbox.error
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: sandbox.error,
        durationMs: Date.now() - started,
      }
    }
    const commandLine = [request.command, ...request.args].join(' ')
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/sandboxes/${sandbox.id}/commands`, {
        method: 'POST',
        headers: jsonHeaders(this.apiKey ?? ''),
        body: JSON.stringify({
          cmd: commandLine,
          cwd: request.cwd,
          env: request.env,
          timeoutMs: request.timeoutMs ?? this.timeoutMs,
        }),
        signal: AbortSignal.timeout((request.timeoutMs ?? this.timeoutMs) + 5_000),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        this.lastError = `command failed: HTTP ${response.status} ${detail.slice(0, 200)}`
        return {
          exitCode: null,
          stdout: '',
          stderr: this.lastError,
          timedOut: false,
          error: this.lastError,
          durationMs: Date.now() - started,
        }
      }
      const result = (await response.json()) as {
        stdout?: string
        stderr?: string
        exitCode?: number
      }
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        timedOut: false,
        durationMs: Date.now() - started,
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      const timedOut = this.lastError.includes('timeout') || this.lastError.includes('abort')
      return {
        exitCode: null,
        stdout: '',
        stderr: this.lastError,
        timedOut,
        error: this.lastError,
        durationMs: Date.now() - started,
      }
    }
  }

  /**
   * Remote isolation probes: home write allowed; /etc write denied (the
   * sandbox runs as a non-root user); the probes run inside the cloud VM.
   */
  async checkIsolation(): Promise<{
    isolated: boolean
    checks: { name: string; passed: boolean; details?: string }[]
  }> {
    const checks: { name: string; passed: boolean; details?: string }[] = []

    const homeWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo ok > ~/probe-write.txt && cat ~/probe-write.txt'],
    })
    checks.push({
      name: 'home-write-allowed',
      passed: homeWrite.exitCode === 0 && homeWrite.stdout.includes('ok'),
      details: homeWrite.error ?? homeWrite.stderr,
    })

    const etcWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo intruder > /etc/probe.txt'],
    })
    checks.push({
      name: 'denied: /etc write',
      passed: etcWrite.exitCode !== 0 || etcWrite.stderr.length > 0,
      details: etcWrite.error ?? etcWrite.stderr,
    })

    return { isolated: checks.every((check) => check.passed), checks }
  }

  /** DELETE /sandboxes/{id} - terminate the remote sandbox. */
  async dispose(): Promise<{ ok: boolean; error?: string }> {
    const handle = this.handle
    if (handle === null) return { ok: true }
    this.handle = null
    if (this.apiKey === undefined) return { ok: false, error: 'E2B_API_KEY is not set' }
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/sandboxes/${handle.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(this.apiKey),
        signal: AbortSignal.timeout(15_000),
      })
      return response.ok
        ? { ok: true }
        : { ok: false, error: `teardown failed: HTTP ${response.status}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  lastErrorText(): string | null {
    return this.lastError
  }
}

export const e2bSandboxProvider: SandboxProvider = defineSandboxProvider(new E2BSandboxProvider())
