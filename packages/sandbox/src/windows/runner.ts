/**
 * Windows sandbox (Phase 126): runs commands under a RESTRICTED TOKEN via
 * `runas /trustlevel:0x20000` (TrustLevel Untrusted) so the subprocess
 * cannot write to sensitive locations - system folders and other users'
 * profiles - even though the launching user could. Output is captured
 * through marker files because `runas` detaches into its own console.
 *
 * When restricted execution is unavailable (non-Windows, service sessions,
 * missing runas), `isAvailable()` reports false with the reason and the
 * provider stays inert - never throws.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const WINDOWS_SANDBOX_ID = 'windows-restricted-token'

/** Directory entries under C:\Users that are shared or not real profiles. */
const SHARED_USERS_ENTRIES = new Set([
  'public',
  'all users',
  'default',
  'default user',
  'desktop.ini',
])

/** Directories the sandboxed process must never write to. */
export function sensitiveDirectories(): string[] {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const systemDrive = process.env.SystemDrive ?? 'C:'
  const dirs = [
    systemRoot,
    join(systemRoot, 'System32'),
    `${systemDrive}\\Program Files`,
    `${systemDrive}\\Program Files (x86)`,
  ]
  const usersRoot = join(systemDrive, 'Users')
  const current = homedir()
  try {
    for (const entry of readdirSafe(usersRoot)) {
      if (SHARED_USERS_ENTRIES.has(entry.toLowerCase())) continue
      const profile = join(usersRoot, entry)
      try {
        if (!statSync(profile).isDirectory()) continue
      } catch {
        continue // junctions and dead links cannot be probed - skip
      }
      if (profile.toLowerCase() !== current.toLowerCase()) dirs.push(profile)
    }
  } catch {
    // users root unreadable - the fixed deny list above still applies
  }
  return dirs
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export interface WindowsSandboxOptions {
  timeoutMs?: number
  /** Extra deny probes (paths the sandbox must not be able to write). */
  extraDeniedPaths?: readonly string[]
}

export class WindowsSandboxProvider implements SandboxProvider {
  readonly id = WINDOWS_SANDBOX_ID
  private readonly options: WindowsSandboxOptions
  private availabilityCache: { available: boolean; reason?: string } | null = null

  constructor(options: WindowsSandboxOptions = {}) {
    this.options = options
  }

  info(): ReturnType<SandboxProvider['info']> {
    const available = this.availabilityCache?.available ?? this.isWinAndRunnableSync()
    return {
      id: WINDOWS_SANDBOX_ID,
      platform: 'win32',
      capabilities: ['execute', 'check-isolation', 'filesystem-deny', 'restricted-token'],
      available,
      ...(available
        ? {}
        : {
            unsupportedReason:
              this.availabilityCache?.reason ??
              'requires Windows with an interactive session and runas.exe',
          }),
    }
  }

  private isWinAndRunnableSync(): boolean {
    if (process.platform !== 'win32') return false
    const probe = spawnSync('where', ['runas'], { encoding: 'utf-8' })
    return probe.status === 0
  }

  async isAvailable(): Promise<boolean> {
    if (this.availabilityCache !== null) return this.availabilityCache.available
    if (process.platform !== 'win32') {
      this.availabilityCache = { available: false, reason: 'not Windows' }
      return false
    }
    // Live probe: a restricted-token echo has to complete end to end.
    const result = await this.execute({
      command: 'cmd',
      args: ['/c', 'echo ok'],
      timeoutMs: 15_000,
    })
    const available = !result.timedOut && result.exitCode === 0 && result.stdout.includes('ok')
    this.availabilityCache = available
      ? { available: true }
      : {
          available: false,
          reason: `restricted-token probe failed: ${result.stderr || result.error || 'no output'}`,
        }
    return available
  }

  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    if (process.platform !== 'win32') {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: 'the Windows restricted-token sandbox requires win32',
        durationMs: 0,
      }
    }
    const scratch = mkdtempSync(join(tmpdir(), 'forge-sandbox-'))
    const stdoutFile = join(scratch, 'stdout.txt')
    const stderrFile = join(scratch, 'stderr.txt')
    const doneFile = join(scratch, 'done.txt')
    const codeFile = join(scratch, 'exitcode.txt')
    const runBat = join(scratch, 'run.bat')

    const commandLine = [request.command, ...request.args].join(' ')
    const envChain = Object.entries(request.env ?? {})
      .map(([key, value]) => `set "${key}=${value}"`)
      .join(' && ')
    const redirect = `> "${stdoutFile}" 2> "${stderrFile}"`
    const body = [
      ...(request.cwd !== undefined ? [`cd /d "${request.cwd}"`] : []),
      ...(envChain.length > 0 ? [envChain] : []),
      `(${commandLine}) ${redirect}`,
      `(echo %ERRORLEVEL%) > "${codeFile}"`,
      `echo done> "${doneFile}"`,
    ].join('\n')
    writeFileSync(runBat, `@echo off\n${body}\n`, 'utf-8')

    // runas detaches into its own console - poll for the done marker.
    const launched = spawnSync('runas', ['/trustlevel:0x20000', `cmd /c "${runBat}"`], {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    if (launched.status !== 0 && launched.error === undefined) {
      const reason = (launched.stderr ?? launched.stdout ?? '').trim()
      this.cleanup(scratch)
      return {
        exitCode: null,
        stdout: '',
        stderr: reason,
        timedOut: false,
        error: `restricted-token launch refused: ${reason || `exit ${launched.status}`}`,
        durationMs: Date.now() - started,
      }
    }

    const timeoutMs = request.timeoutMs ?? this.options.timeoutMs ?? 30_000
    const deadline = Date.now() + timeoutMs
    let timedOut = false
    while (!existsSync(doneFile)) {
      if (Date.now() > deadline) {
        timedOut = true
        break
      }
      await sleep(50)
    }

    const stdout = readIfExists(stdoutFile)
    const stderr = readIfExists(stderrFile)
    const exitCode = readIntIfExists(codeFile)
    this.cleanup(scratch)
    const base: SandboxExecutionResult = {
      exitCode: timedOut ? null : exitCode,
      stdout,
      stderr,
      timedOut,
      durationMs: Date.now() - started,
    }
    if (timedOut) {
      return { ...base, error: `command exceeded ${timeoutMs}ms inside the restricted token` }
    }
    if (exitCode === null && !timedOut) {
      return { ...base, error: 'the sandboxed command produced no exit code marker' }
    }
    return base
  }

  /** Probes: sandboxed write to scratch granted; sensitive writes denied. */
  async checkIsolation(): Promise<IsolationReportLike> {
    const checks: { name: string; passed: boolean; details?: string }[] = []

    const scratchWrite = await this.execute({
      command: 'cmd',
      args: ['/c', 'echo isolated> forge-sandbox-probe.txt'],
      timeoutMs: 20_000,
    })
    checks.push({
      name: 'scratch-write-allowed',
      passed: !scratchWrite.timedOut && scratchWrite.exitCode === 0,
      details: scratchWrite.error ?? scratchWrite.stderr,
    })

    for (const dir of sensitiveDirectories()) {
      const denied = await this.execute({
        command: 'cmd',
        args: ['/c', `echo intruder> "${join(dir, 'forge-sandbox-deny-probe.txt')}"`],
        timeoutMs: 20_000,
      })
      // Deny = the write did not succeed (non-zero exit or no marker_file style success).
      const writeFailed = denied.exitCode !== 0 || denied.stderr.length > 0
      checks.push({
        name: `denied: ${dir}`,
        passed: denied.timedOut === false && writeFailed,
        details: writeFailed ? undefined : 'write unexpectedly succeeded',
      })
    }

    for (const dir of this.options.extraDeniedPaths ?? []) {
      const denied = await this.execute({
        command: 'cmd',
        args: ['/c', `echo intruder> "${join(dir, 'forge-sandbox-deny-probe.txt')}"`],
        timeoutMs: 20_000,
      })
      checks.push({ name: `denied: ${dir}`, passed: denied.exitCode !== 0 })
    }

    return { isolated: checks.every((check) => check.passed), checks }
  }

  private cleanup(scratch: string): void {
    try {
      rmSync(scratch, { recursive: true, force: true })
    } catch {
      // best effort - the OS temp cleaner handles leftovers
    }
  }
}

interface IsolationReportLike {
  isolated: boolean
  checks: { name: string; passed: boolean; details?: string }[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readIfExists(file: string): string {
  try {
    return existsSync(file) ? readFileSync(file, 'utf-8') : ''
  } catch {
    return ''
  }
}

function readIntIfExists(file: string): number | null {
  const raw = readIfExists(file).trim()
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export const windowsSandboxProvider: SandboxProvider = defineSandboxProvider(
  new WindowsSandboxProvider(),
)
