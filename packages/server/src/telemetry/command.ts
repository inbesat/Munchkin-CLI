import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_TELEMETRY_ENDPOINT, getGlobalConfigPath, loadConfig } from '@forge/core'

export interface TelemetryCommandOptions {
  write?: (line: string) => void
  errorWrite?: (line: string) => void
  /** Global config file override (tests). */
  configPath?: string
  /** Project directory used to report the effective state (tests). */
  cwd?: string
}

/**
 * `forge telemetry <status|on|off>` (Phase 147). Telemetry is opt-in and off by
 * default; toggling writes `telemetry.enabled` in the global config file.
 */
export async function runTelemetryCommand(
  rawArgv: string[],
  opts: TelemetryCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const errorWrite = opts.errorWrite ?? ((line: string) => process.stderr.write(`${line}\n`))
  const argv = rawArgv[0] === 'telemetry' ? rawArgv.slice(1) : rawArgv
  const sub = argv[0] ?? 'status'
  const configPath = opts.configPath ?? getGlobalConfigPath()

  if (sub === 'status') {
    const { config } = loadConfig(opts.cwd !== undefined ? { cwd: opts.cwd } : {})
    write(`telemetry: ${config.telemetry.enabled ? 'on' : 'off'}`)
    write(`endpoint: ${config.telemetry.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT}`)
    write(
      'collects: command, session, tool, error, and performance events (names, counts, durations)',
    )
    write('never: code, prompts, file paths, tool arguments, or personal data')
    write('toggle: forge telemetry on|off   ·   privacy policy: docs/privacy.md')
    write(`config: ${configPath} (global)`)
    return 0
  }

  if (sub === 'on' || sub === 'off') {
    const enabled = sub === 'on'
    let raw: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try {
        raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
      } catch {
        errorWrite(`error: cannot update ${configPath}: invalid JSON`)
        return 1
      }
    }
    const telemetry =
      typeof raw.telemetry === 'object' && raw.telemetry !== null ? raw.telemetry : {}
    raw.telemetry = { ...telemetry, enabled }
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`)
    write(`telemetry ${enabled ? 'enabled' : 'disabled'} (saved to ${configPath})`)
    return 0
  }

  errorWrite(`error: unknown telemetry subcommand '${sub}' (expected 'status', 'on', or 'off')`)
  return 1
}
