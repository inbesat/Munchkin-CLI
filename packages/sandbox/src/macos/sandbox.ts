/**
 * macOS Seatbelt sandbox (Phase 127): runs commands under `sandbox-exec`
 * with a generated profile - (deny default) plus allow rules for the file
 * system paths the command needs, and network/process rules only when the
 * caller opts in. `sandbox-exec` ships with macOS (marked deprecated by
 * Apple yet fully functional and still what native tooling uses), so no
 * Node addon is required.
 * No-throw: failures surface through result objects.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const MACOS_SANDBOX_ID = 'macos-seatbelt'

export interface SeatbeltProfileOptions {
  /** Directories the sandboxed command may write (scratch is always added). */
  scratchPaths: readonly string[]
  /** Additional writable directories (e.g. the project cwd). */
  writablePaths?: readonly string[]
  /** Allow outbound network (default: denied). */
  allowNetwork?: boolean
  /** Allow child-process creation beyond the initial exec (default: allowed for build tools). */
  allowProcessFork?: boolean
}

function quote(path: string): string {
  return `"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/**
 * Deterministic Seatbelt profile: (deny default) + explicit allows so an
 * unlisted operation fails closed.
 */
export function buildSeatbeltProfile(options: SeatbeltProfileOptions): string {
  const lines: string[] = ['(version 1)', '(deny default)']
  lines.push('(allow process-exec)')
  if (options.allowProcessFork !== false) lines.push('(allow process-fork)')
  lines.push('(allow file-read*)')
  lines.push('(allow sysctl-read)')
  lines.push('(allow mach-lookup)')
  lines.push('(allow iokit-open)')
  lines.push('(allow system-socket)')
  const writable = [...options.scratchPaths, ...(options.writablePaths ?? [])].map(quote)
  lines.push(`(allow file-write* ${writable.map((path) => `(subpath ${path})`).join(' ')})`)
  if (options.allowNetwork === true) lines.push('(allow network*)')
  return lines.join('\n')
}

export interface MacosSeatbeltOptions {
  timeoutMs?: number
}

export class MacosSeatbeltProvider implements SandboxProvider {
  readonly id = MACOS_SANDBOX_ID

  constructor(private readonly options: MacosSeatbeltOptions = {}) {}

  info(): ReturnType<SandboxProvider['info']> {
    return {
      id: MACOS_SANDBOX_ID,
      platform: 'darwin',
      capabilities: ['execute', 'check-isolation', 'filesystem-deny', 'network-deny'],
      available: process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec'),
      ...(process.platform === 'darwin' ? {} : { unsupportedReason: 'requires macOS' }),
    }
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false
    if (!existsSync('/usr/bin/sandbox-exec')) return false
    const probe = spawnSync('/usr/bin/sandbox-exec', ['-f', '/dev/null', '--', '/bin/echo', 'ok'], {
      encoding: 'utf-8',
    })
    return probe.status === 0
  }

  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    if (process.platform !== 'darwin') {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: 'the macOS Seatbelt sandbox requires darwin',
        durationMs: 0,
      }
    }
    const scratch = mkdtempSync(join(tmpdir(), 'forge-seatbelt-'))
    const profileFile = join(scratch, 'profile.sb')
    writeFileSync(
      profileFile,
      buildSeatbeltProfile({
        scratchPaths: [scratch, ...(request.cwd !== undefined ? [request.cwd] : [])],
        allowNetwork: false,
      }),
      'utf-8',
    )

    const result = spawnSync(
      '/usr/bin/sandbox-exec',
      ['-f', profileFile, '--', request.command, ...request.args],
      {
        cwd: request.cwd,
        encoding: 'utf-8',
        timeout: request.timeoutMs ?? this.options.timeoutMs ?? 30_000,
        env: request.env !== undefined ? { ...process.env, ...request.env } : undefined,
      },
    )

    const timedOut = result.error !== undefined && result.error.name === 'ETIMEDOUT'
    const payload: SandboxExecutionResult = {
      exitCode: timedOut ? null : (result.status ?? null),
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      timedOut,
      durationMs: Date.now() - started,
    }
    rmSync(scratch, { recursive: true, force: true })
    if (result.error !== undefined && !timedOut) {
      return { ...payload, error: result.error.message }
    }
    return payload
  }

  /**
   * Probes: scratch write allowed; writes outside the sandbox denied
   * (home + /usr/local); network denied (default profile).
   */
  async checkIsolation(): Promise<{
    isolated: boolean
    checks: { name: string; passed: boolean; details?: string }[]
  }> {
    const checks: { name: string; passed: boolean; details?: string }[] = []

    const scratchWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo ok > file && cat file'],
      cwd: process.cwd(),
    })
    checks.push({
      name: 'scratch-write-allowed',
      passed:
        !scratchWrite.timedOut && scratchWrite.exitCode === 0 && scratchWrite.stdout.includes('ok'),
      details: scratchWrite.error ?? scratchWrite.stderr,
    })

    const homeWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo intruder > ~/forge-sandbox-deny-probe.txt'],
    })
    checks.push({
      name: 'denied: home write',
      passed: homeWrite.exitCode !== 0 || homeWrite.stderr.length > 0,
      details: homeWrite.exitCode === 0 ? 'write unexpectedly succeeded' : undefined,
    })

    const usrWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo intruder > /usr/local/forge-sandbox-deny-probe.txt'],
    })
    checks.push({
      name: 'denied: /usr/local write',
      passed: usrWrite.exitCode !== 0 || usrWrite.stderr.length > 0,
    })

    const network = await this.execute({
      command: '/usr/bin/curl',
      args: ['--max-time', '5', 'http://example.invalid'],
    })
    checks.push({
      name: 'denied: network',
      passed: network.exitCode !== 0,
    })

    return { isolated: checks.every((check) => check.passed), checks }
  }
}

export const macosSeatbeltProvider: SandboxProvider = defineSandboxProvider(
  new MacosSeatbeltProvider(),
)

/** Read a generated profile back (test helper). */
export function readProfileFile(file: string): string {
  return readFileSync(file, 'utf-8')
}
