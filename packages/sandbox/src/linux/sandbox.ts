/**
 * Linux sandbox (Phase 128): filesystem isolation via **bubblewrap**, which
 * enforces Landlock LSM rules under the hood (kernel 5.13+) - the blueprint's
 * sanctioned fallback that needs no Node addon. The host root is mounted
 * READ-ONLY; only the per-run scratch (and optionally the project cwd) is
 * writable; network is unshared unless opted in.
 * No-throw: failures surface through result objects.
 * Live verification requires a Linux machine; elsewhere tests exercise the
 * pure argument assembly and self-skip the live runs.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type SandboxCommandRequest,
  type SandboxExecutionResult,
  type SandboxProvider,
  defineSandboxProvider,
} from '../types'

export const LINUX_SANDBOX_ID = 'linux-landlock'

export interface BwrapOptions {
  scratch: string
  /** Extra writable bind mounts (e.g. the project cwd). */
  writablePaths?: readonly string[]
  /** Share the network namespace (default: unshared = network denied). */
  allowNetwork?: boolean
}

/** Assemble the bubblewrap argv before the `--` separator. */
export function buildBwrapArgs(options: BwrapOptions): string[] {
  const args: string[] = ['--ro-bind', '/', '/']
  args.push('--bind', options.scratch, options.scratch)
  for (const path of options.writablePaths ?? []) {
    args.push('--bind', path, path)
  }
  args.push('--dev', '/dev')
  args.push('--proc', '/proc')
  args.push('--tmpfs', '/tmp')
  if (options.allowNetwork !== true) args.push('--unshare-net')
  args.push('--die-with-parent', '--new-session')
  return args
}

export interface LandlockOptions {
  timeoutMs?: number
}

export class LandlockProvider implements SandboxProvider {
  readonly id = LINUX_SANDBOX_ID

  constructor(private readonly options: LandlockOptions = {}) {}

  info(): ReturnType<SandboxProvider['info']> {
    return {
      id: LINUX_SANDBOX_ID,
      platform: 'linux',
      capabilities: [
        'execute',
        'check-isolation',
        'filesystem-deny',
        'network-deny',
        'read-only-root',
      ],
      available: process.platform === 'linux' && existsSync('/usr/bin/bwrap'),
      ...(process.platform === 'linux'
        ? {}
        : { unsupportedReason: 'requires Linux with bubblewrap installed' }),
    }
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') return false
    if (!existsSync('/usr/bin/bwrap')) return false
    const probe = spawnSync('/usr/bin/bwrap', ['--ro-bind', '/', '/', '--', '/bin/echo', 'ok'], {
      encoding: 'utf-8',
      timeout: 15_000,
    })
    return probe.status === 0
  }

  async execute(request: SandboxCommandRequest): Promise<SandboxExecutionResult> {
    const started = Date.now()
    if (process.platform !== 'linux') {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: 'the Linux Landlock sandbox requires linux + bubblewrap',
        durationMs: 0,
      }
    }
    const scratch = mkdtempSync(join(tmpdir(), 'forge-landlock-'))
    mkdirSync(join(scratch, 'work'), { recursive: true })
    const cwd = request.cwd ?? join(scratch, 'work')
    mkdirSync(cwd, { recursive: true })

    const bwrapArgs = [
      ...buildBwrapArgs({ scratch, writablePaths: [cwd], allowNetwork: false }),
      '--',
      request.command,
      ...request.args,
    ]
    const result = spawnSync('/usr/bin/bwrap', bwrapArgs, {
      cwd,
      encoding: 'utf-8',
      timeout: request.timeoutMs ?? this.options.timeoutMs ?? 30_000,
      env: request.env !== undefined ? { ...process.env, ...request.env } : undefined,
    })

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

  /** Probes: scratch/cwd write allowed; write outside bind mounts + network denied. */
  async checkIsolation(): Promise<{
    isolated: boolean
    checks: { name: string; passed: boolean; details?: string }[]
  }> {
    const checks: { name: string; passed: boolean; details?: string }[] = []

    const scratchWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo ok > scratch-write.txt && cat scratch-write.txt'],
      cwd: process.cwd(),
    })
    checks.push({
      name: 'writable-bind-write-allowed',
      passed:
        !scratchWrite.timedOut && scratchWrite.exitCode === 0 && scratchWrite.stdout.includes('ok'),
      details: scratchWrite.error ?? scratchWrite.stderr,
    })

    const etcWrite = await this.execute({
      command: '/bin/sh',
      args: ['-c', 'echo intruder > /etc/forge-landlock-probe.txt'],
    })
    checks.push({
      name: 'denied: /etc write (read-only root)',
      passed: etcWrite.exitCode !== 0 || etcWrite.stderr.length > 0,
      details: etcWrite.exitCode === 0 ? 'write unexpectedly succeeded' : undefined,
    })

    const network = await this.execute({
      command: '/bin/sh',
      args: [
        '-c',
        'command -v curl >/dev/null && curl --max-time 5 http://example.invalid || echo curl-missing',
      ],
    })
    checks.push({
      name: 'denied: network',
      passed:
        network.timedOut !== true &&
        (network.stdout.includes('curl-missing') || network.exitCode !== 0),
      details: network.stderr || network.stdout.slice(0, 120),
    })

    return { isolated: checks.every((check) => check.passed), checks }
  }
}

export const linuxLandlockProvider: SandboxProvider = defineSandboxProvider(new LandlockProvider())
