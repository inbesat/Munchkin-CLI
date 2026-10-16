/**
 * Daytona remote sandbox adapter (Phase 130): runs commands in Daytona
 * cloud workspaces over its REST API (injectable HTTP layer for tests).
 * No-throw: HTTP failures, missing API keys, and timeouts are results.
 */

import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const DAYTONA_SANDBOX_ID = 'daytona-remote'

export interface DaytonaOptions {
  /** Daytona API key (default: DAYTONA_API_KEY env). */
  apiKey?: string
  baseUrl?: string
  /** Image/snapshot for created workspaces. */
  image?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class DaytonaSandboxProvider implements SandboxProvider {
  readonly id = DAYTONA_SANDBOX_ID
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly image: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private workspaceId: string | null = null
  private lastError: string | null = null

  constructor(options: DaytonaOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DAYTONA_API_KEY
    this.baseUrl = options.baseUrl ?? 'https://api.daytona.io'
    this.image = options.image ?? 'ubuntu:24.04'
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  info(): ReturnType<SandboxProvider['info']> {
    const available = this.apiKey !== undefined
    const info: ReturnType<SandboxProvider['info']> = {
      id: DAYTONA_SANDBOX_ID,
      platform: 'daytona-cloud',
      capabilities: ['execute', 'remote', 'cloud', 'isolated-per-run'],
      available,
    }
    if (!available) info.unsupportedReason = 'DAYTONA_API_KEY is not set'
    return info
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey !== undefined
  }

  /** POST /workspace - create (once; reused for subsequent commands). */
  private async ensureWorkspace(): Promise<
    { ok: true; id: string } | { ok: false; error: string }
  > {
    if (this.workspaceId !== null) return { ok: true, id: this.workspaceId }
    if (this.apiKey === undefined) return { ok: false, error: 'DAYTONA_API_KEY is not set' }
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ image: this.image, timeoutMs: this.timeoutMs }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return {
          ok: false,
          error: `workspace create failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
        }
      }
      const parsed = (await response.json()) as { id?: string }
      if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
        return { ok: false, error: 'workspace create returned no id' }
      }
      this.workspaceId = parsed.id
      return { ok: true, id: this.workspaceId }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** POST /workspace/{id}/exec - mapped into SandboxExecutionResult. */
  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    const workspace = await this.ensureWorkspace()
    if (!workspace.ok) {
      this.lastError = workspace.error
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: workspace.error,
        durationMs: Date.now() - started,
      }
    }
    const commandLine = [request.command, ...request.args].join(' ')
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/workspace/${workspace.id}/exec`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey ?? ''}`,
        },
        body: JSON.stringify({
          command: commandLine,
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
      const result = (await response.json()) as { output?: string; exitCode?: number }
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.output ?? '',
        stderr: '',
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

  /** Remote probes run inside the cloud workspace (non-root user). */
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

  /** DELETE /workspace/{id} - terminate the remote workspace. */
  async dispose(): Promise<{ ok: boolean; error?: string }> {
    const id = this.workspaceId
    if (id === null) return { ok: true }
    this.workspaceId = null
    if (this.apiKey === undefined) return { ok: false, error: 'DAYTONA_API_KEY is not set' }
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/workspace/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${this.apiKey}` },
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

export const daytonaSandboxProvider: SandboxProvider = defineSandboxProvider(
  new DaytonaSandboxProvider(),
)
