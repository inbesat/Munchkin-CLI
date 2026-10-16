import type { HookOutcome } from '../engine'

/**
 * `command` hook handler (Phase 104): run a shell command with the event
 * payload on stdin. Blocking convention (ARCHITECTURE.md): exit code 2
 * blocks the default action with stderr as the reason. Exit 0 observes;
 * any other exit is an error result.
 */
export interface CommandHookOptions {
  command: string
  cwd?: string
  timeoutMs?: number
  /** Injectable runner for offline tests; default shells out with `/bin/sh`-style argv. */
  runner?: (
    command: string,
    cwd: string | undefined,
    stdin: string,
  ) => { status: number | null; stdout: string; stderr: string }
}

export function commandHook(
  options: CommandHookOptions,
): (payload: unknown) => Promise<HookOutcome> {
  const runner =
    options.runner ??
    ((command: string, cwd: string | undefined, stdin: string) => {
      const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
      return spawnSync(command, {
        cwd,
        input: stdin,
        encoding: 'utf-8',
        timeout: options.timeoutMs ?? 60_000,
        shell: true,
      }) as unknown as { status: number | null; stdout: string; stderr: string }
    })

  return async (payload) => {
    const stdin = JSON.stringify(payload)
    try {
      const { status, stderr } = runner(options.command, options.cwd, stdin)
      if (status === 2) return { block: true, reason: stderr.trim() || 'command hook blocked' }
      if (status === 0) return undefined
      return undefined // non-2 exit codes observe but never crash the engine
    } catch (error) {
      return {
        block: true,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
