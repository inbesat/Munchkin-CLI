import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CONFIG,
  ForgeConfig,
  getGlobalConfigPath,
  getLocalConfigPath,
  getProjectConfigPath,
  loadConfig,
  mergeConfigs,
} from '@forge/core'

export interface DoctorCheck {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

export interface DoctorCommandOptions {
  write?: (line: string) => void
  /** Project directory for config resolution (tests). */
  cwd?: string
  /** Effective config override (tests); default loads from disk. */
  config?: ForgeConfig
  /** Config files to validate (tests); default global + project + local. */
  configPaths?: string[]
  /** Environment for provider keys (tests); default process.env. */
  env?: Record<string, string | undefined>
  /** Directory holding the TUI package (tests); default the workspace sibling. */
  tuiDir?: string
  /** Probe provider endpoints for reachability (--online). */
  online?: boolean
  /** Reachability probe (tests); default HEAD request. */
  fetch?: (url: string) => Promise<unknown>
}

const MIN_BUN = '1.2.0'

const PROVIDERS = [
  { name: 'anthropic', key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com' },
  { name: 'openai', key: 'OPENAI_API_KEY', url: 'https://api.openai.com' },
  { name: 'google', key: 'GOOGLE_API_KEY', url: 'https://generativelanguage.googleapis.com' },
]

/**
 * `forge doctor [--json] [--online]` (Phase 148). Diagnostics over the whole
 * installation: runtime version, TUI runtime, provider setup (optionally probed
 * live), MCP servers, plugins, config validity, and permissions. Exits 1 when
 * any check fails.
 */
export async function runDoctorCommand(
  rawArgv: string[],
  opts: DoctorCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const argv = rawArgv[0] === 'doctor' ? rawArgv.slice(1) : rawArgv
  const online = argv.includes('--online') || opts.online === true
  const checks = await runDoctorChecks({ ...opts, online })

  const ok = checks.filter((check) => check.status === 'ok').length
  const warn = checks.filter((check) => check.status === 'warn').length
  const fail = checks.filter((check) => check.status === 'fail').length

  if (argv.includes('--json')) {
    write(JSON.stringify({ checks, ok, warn, fail, passed: fail === 0 }, null, 2))
  } else {
    write('forge doctor')
    write('')
    for (const check of checks) {
      const label = check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'WARN' : 'FAIL'
      write(`${label.padEnd(6)}${check.name.padEnd(14)}${check.detail}`)
    }
    write('')
    write(`${checks.length} checks: ${ok} ok · ${warn} warn · ${fail} fail`)
  }
  return fail > 0 ? 1 : 0
}

export async function runDoctorChecks(opts: DoctorCommandOptions = {}): Promise<DoctorCheck[]> {
  const cwd = opts.cwd ?? process.cwd()
  const config = opts.config ?? loadConfig({ cwd }).config
  const env = opts.env ?? process.env
  const tuiDir = opts.tuiDir ?? fileURLToPath(new URL('../../../tui/', import.meta.url))
  const configPaths = opts.configPaths ?? [
    getGlobalConfigPath(),
    getProjectConfigPath(cwd),
    getLocalConfigPath(cwd),
  ]
  return [
    checkBun(),
    checkOpenTui(tuiDir),
    await checkProviders(env, opts),
    checkMcp(config),
    checkPlugins(config),
    checkConfigFiles(configPaths),
    checkPermissions(config),
  ]
}

function checkBun(): DoctorCheck {
  const version = process.versions.bun
  if (!version) {
    return { name: 'bun', status: 'fail', detail: `not running under Bun (required >= ${MIN_BUN})` }
  }
  const [major = 0, minor = 0] = version.split('.').map(Number)
  const [minMajor = 0, minMinor = 0] = MIN_BUN.split('.').map(Number)
  const supported = major > minMajor || (major === minMajor && minor >= minMinor)
  return {
    name: 'bun',
    status: supported ? 'ok' : 'fail',
    detail: `bun ${version} (required >= ${MIN_BUN})`,
  }
}

function checkOpenTui(tuiDir: string): DoctorCheck {
  const manifest = join(tuiDir, 'node_modules', '@opentui', 'solid', 'package.json')
  if (existsSync(manifest)) {
    try {
      const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }
      if (version) return { name: 'opentui', status: 'ok', detail: `@opentui/solid ${version}` }
    } catch {
      // Unreadable manifest - fall through to the warning below.
    }
  }
  return {
    name: 'opentui',
    status: 'warn',
    detail: '@opentui/solid not installed (TUI-only dependency)',
  }
}

async function checkProviders(
  env: Record<string, string | undefined>,
  opts: DoctorCommandOptions,
): Promise<DoctorCheck> {
  const configured = PROVIDERS.filter((provider) => (env[provider.key] ?? '') !== '')
  if (configured.length === 0) {
    return {
      name: 'providers',
      status: 'warn',
      detail: `no API keys configured (set ${PROVIDERS.map((p) => p.key).join(', ')})`,
    }
  }
  const names = configured.map((provider) => provider.name).join(', ')
  if (opts.online !== true) {
    return {
      name: 'providers',
      status: 'ok',
      detail: `${names} key(s) configured (use --online to probe reachability)`,
    }
  }
  const probe = opts.fetch ?? ((url: string) => fetch(url, { method: 'HEAD' }))
  const results: string[] = []
  for (const provider of configured) {
    try {
      await probe(provider.url)
      results.push(`${provider.name}: reachable`)
    } catch {
      results.push(`${provider.name}: unreachable`)
    }
  }
  const unreachable = results.some((result) => result.endsWith('unreachable'))
  return { name: 'providers', status: unreachable ? 'warn' : 'ok', detail: results.join(', ') }
}

function checkMcp(config: ForgeConfig): DoctorCheck {
  const servers = Object.entries(config.mcp)
  const enabled = servers.filter(([, server]) => server.enabled).length
  const detail =
    servers.length === 0
      ? '0 server(s) configured'
      : `${servers.length} server(s) configured, ${enabled} enabled: ${servers.map(([name]) => name).join(', ')}`
  return { name: 'mcp', status: 'ok', detail }
}

function checkPlugins(config: ForgeConfig): DoctorCheck {
  const enabled = config.plugins.filter((plugin) => plugin.enabled).length
  return {
    name: 'plugins',
    status: 'ok',
    detail: `${config.plugins.length} plugin(s) configured, ${enabled} enabled`,
  }
}

function checkConfigFiles(paths: string[]): DoctorCheck {
  const problems: string[] = []
  let checked = 0
  for (const file of paths) {
    if (!existsSync(file)) continue
    checked += 1
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ForgeConfig>
      const result = ForgeConfig.safeParse(mergeConfigs(DEFAULT_CONFIG, parsed))
      if (!result.success) {
        const issue = result.error.issues[0]
        problems.push(`${file}: ${issue?.path.join('.')} ${issue?.message}`)
      }
    } catch {
      problems.push(`${file}: invalid JSON`)
    }
  }
  if (problems.length > 0) return { name: 'config', status: 'fail', detail: problems.join('; ') }
  return { name: 'config', status: 'ok', detail: `${checked} file(s) checked, schema valid` }
}

function checkPermissions(config: ForgeConfig): DoctorCheck {
  return {
    name: 'permissions',
    status: 'ok',
    detail: `mode: ${config.permissions.mode}, ${config.permissions.rules.length} rule(s)`,
  }
}
