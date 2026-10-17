import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import * as readline from 'node:readline'
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@forge/ai'
import { DEFAULT_CONFIG, ForgeConfig, getGlobalConfigPath, mergeConfigs } from '@forge/core'

/**
 * `forge setup [--yes]` (Phase 151): first-run onboarding wizard. Walks through
 * provider, API key, model, theme and permission mode, then writes the global
 * config file (preserving keys it does not own). `--yes` accepts every default
 * without prompting.
 */

/** Provider metadata: config-schema id, env var, resolver wiring status. */
export const SETUP_PROVIDERS = [
  { id: 'anthropic', env: 'ANTHROPIC_API_KEY', wired: true },
  { id: 'openai', env: 'OPENAI_API_KEY', wired: true },
  { id: 'google', env: 'GOOGLE_API_KEY', wired: true },
  { id: 'deepseek', env: 'DEEPSEEK_API_KEY', wired: false },
  {
    id: 'bedrock',
    env: 'AWS_ACCESS_KEY_ID',
    wired: false,
    cloud: 'AWS credentials (AWS_ACCESS_KEY_ID / AWS_PROFILE)',
  },
  {
    id: 'vertex',
    env: 'GOOGLE_APPLICATION_CREDENTIALS',
    wired: false,
    cloud: 'Google Cloud credentials (GOOGLE_APPLICATION_CREDENTIALS / gcloud auth)',
  },
] as const

/** Model suggestions per provider; the preset lists are the resolvable names. */
export const MODEL_SUGGESTIONS: Record<string, readonly string[]> = {
  anthropic: ANTHROPIC_MODELS.map((model) => model.name),
  openai: OPENAI_MODELS.map((model) => model.name),
  google: GOOGLE_MODELS.map((model) => model.name),
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  bedrock: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],
  vertex: ['gemini-2.5-pro', 'gemini-2.5-flash'],
}

export const SETUP_THEMES = [
  { id: 'dark', hint: 'dark background' },
  { id: 'light', hint: 'light background' },
  { id: 'auto', hint: 'follow the terminal' },
] as const

export const SETUP_PERMISSION_MODES = [
  { id: 'ask', hint: 'ask before writes and commands (recommended)' },
  { id: 'auto', hint: 'allow writes and commands with safety checks' },
  { id: 'plan', hint: 'read-only; writes and commands are denied' },
  { id: 'bypass', hint: 'allow everything (circuit breakers still active)' },
] as const

export interface SetupAskOptions {
  /** Default shown in brackets; an empty answer picks it. */
  default?: string
  /** Hide the typed characters (API keys). */
  mask?: boolean
}

/** Ask one question. Returns `null` when the user cancels (EOF / Ctrl+C). */
export type SetupAsk = (question: string, opts?: SetupAskOptions) => Promise<string | null>

export interface SetupCommandOptions {
  write?: (line: string) => void
  errorWrite?: (line: string) => void
  ask?: SetupAsk
  /** Global config path override (tests). */
  configPath?: string
  env?: Record<string, string | undefined>
}

type RawConfig = Record<string, unknown>

function cancelled(errorWrite: (line: string) => void): number {
  errorWrite('setup cancelled')
  return 1
}

/** Readline-based default: one interface per question; `*` echo for masked input. */
function defaultAsk(): SetupAsk {
  if (process.stdin.isTTY !== true) return pipedAsk()
  return async (question, opts = {}) => {
    const suffix = opts.default !== undefined && opts.default !== '' ? ` [${opts.default}]` : ''
    if (opts.mask === true) return askMasked(`${question}${suffix}`)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })
    try {
      return await new Promise<string | null>((resolve) => {
        let settled = false
        const done = (value: string | null) => {
          if (settled) return
          settled = true
          rl.removeListener('close', onClose)
          resolve(value)
        }
        const onClose = () => done(null)
        rl.once('close', onClose)
        rl.question(`${question}${suffix} `, (value) => done(value))
      })
    } finally {
      rl.close()
    }
  }
}

/**
 * Piped/non-TTY input: read stdin once and serve queued lines (masking is
 * pointless when nothing is echoed). Recreating a readline interface per
 * question would drop lines already buffered by the previous interface.
 */
function pipedAsk(): SetupAsk {
  let lines: string[] | null = null
  return async () => {
    if (lines === null) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
      lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
    }
    const next = lines.shift()
    return next === undefined ? null : next
  }
}

function askMasked(question: string): Promise<string | null> {
  process.stdout.write(`${question} `)
  const stdin = process.stdin
  stdin.setRawMode(true)
  stdin.resume()
  return new Promise<string | null>((resolve) => {
    let value = ''
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
    }
    const finish = (result: string | null) => {
      cleanup()
      process.stdout.write('\n')
      resolve(result)
    }
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return finish(value)
        if (ch === '\u0003') return finish(null) // Ctrl+C
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        if (ch >= ' ') {
          value += ch
          process.stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}

async function askChoice(
  ask: SetupAsk,
  write: (line: string) => void,
  question: string,
  options: readonly { id: string; hint?: string }[],
  defaultId: string,
): Promise<string | null> {
  write(question)
  options.forEach((option, index) => {
    const marker = option.id === defaultId ? ' (default)' : ''
    const hint = option.hint !== undefined ? ` — ${option.hint}` : ''
    write(`  ${index + 1}. ${option.id}${marker}${hint}`)
  })
  const answer = await ask(`Choose [${defaultId}]`)
  if (answer === null) return null
  const trimmed = answer.trim()
  if (trimmed === '') return defaultId
  const byNumber = Number.parseInt(trimmed, 10)
  if (Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= options.length) {
    return options[byNumber - 1]?.id ?? defaultId
  }
  const byId = options.find((option) => option.id === trimmed.toLowerCase())
  if (byId) return byId.id
  write(`'${trimmed}' is not one of the options — using ${defaultId}`)
  return defaultId
}

export async function runSetupCommand(
  rawArgv: string[],
  opts: SetupCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const errorWrite = opts.errorWrite ?? ((line: string) => process.stderr.write(`${line}\n`))
  const argv = rawArgv[0] === 'setup' ? rawArgv.slice(1) : rawArgv
  const yes = argv.includes('--yes')
  const env = opts.env ?? process.env
  const configPath = opts.configPath ?? getGlobalConfigPath()
  const ask = opts.ask ?? defaultAsk()

  // Read the existing config as raw JSON so keys the wizard does not own survive.
  let raw: RawConfig = {}
  if (existsSync(configPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('config root must be an object')
      }
      raw = parsed as RawConfig
    } catch {
      errorWrite(`error: cannot update ${configPath}: invalid JSON`)
      return 1
    }
  }
  const rawSection = (key: string): RawConfig => {
    const value = raw[key]
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as RawConfig)
      : {}
  }

  write('forge setup — a few questions and you are ready to go.')
  write(`config: ${configPath}`)
  write('')

  // 1. Provider
  const defaultProvider =
    typeof rawSection('model').provider === 'string'
      ? (rawSection('model').provider as string)
      : 'anthropic'
  let provider: string
  if (yes) {
    provider = defaultProvider
  } else {
    const choice = await askChoice(ask, write, 'Provider:', SETUP_PROVIDERS, defaultProvider)
    if (choice === null) return cancelled(errorWrite)
    provider = choice
  }
  const meta = SETUP_PROVIDERS.find((candidate) => candidate.id === provider)
  if (meta === undefined) {
    errorWrite(`error: unknown provider '${provider}'`)
    return 1
  }

  // 2. API key
  const detected = env[meta.env]
  let apiKey: string | undefined
  if ('cloud' in meta && meta.cloud !== undefined) {
    write(`${provider} uses ${meta.cloud} — nothing to enter here.`)
  } else if (!yes) {
    const question = detected
      ? `API key for ${provider} (Enter to keep using ${meta.env})`
      : `API key for ${provider} (optional; Enter to skip)`
    if (detected) write(`✓ ${meta.env} detected in your environment`)
    const answer = await ask(question, { mask: true })
    if (answer === null) return cancelled(errorWrite)
    const trimmed = answer.trim()
    if (trimmed !== '') apiKey = trimmed
  }

  // 3. Model
  const suggestions = MODEL_SUGGESTIONS[provider] ?? []
  const currentModel = rawSection('model')
  const defaultModel =
    currentModel.provider === provider &&
    typeof currentModel.model === 'string' &&
    currentModel.model
      ? currentModel.model
      : (suggestions[0] ?? '')
  let model: string
  if (yes) {
    model = defaultModel
  } else {
    if (suggestions.length > 0) {
      write(`Suggested ${provider} models: ${suggestions.slice(0, 5).join(', ')}`)
    }
    const answer = await ask('Model id', { default: defaultModel })
    if (answer === null) return cancelled(errorWrite)
    const trimmed = answer.trim()
    model = trimmed !== '' ? trimmed : defaultModel
  }

  // 4. Theme
  const currentTheme = rawSection('theme')
  const defaultTheme =
    typeof currentTheme.name === 'string' ? (currentTheme.name as string) : 'dark'
  let theme: string
  if (yes) {
    theme = defaultTheme
  } else {
    const choice = await askChoice(ask, write, 'Theme:', SETUP_THEMES, defaultTheme)
    if (choice === null) return cancelled(errorWrite)
    theme = choice
  }

  // 5. Permission mode
  const currentPermissions = rawSection('permissions')
  const defaultMode =
    typeof currentPermissions.mode === 'string' ? (currentPermissions.mode as string) : 'ask'
  let mode: string
  if (yes) {
    mode = defaultMode
  } else {
    const choice = await askChoice(
      ask,
      write,
      'Permission mode:',
      SETUP_PERMISSION_MODES,
      defaultMode,
    )
    if (choice === null) return cancelled(errorWrite)
    mode = choice
  }

  // 6. Merge, validate, write
  const merged: RawConfig = {
    ...raw,
    model: { ...rawSection('model'), provider, model },
    theme: { ...rawSection('theme'), name: theme },
    permissions: { ...rawSection('permissions'), mode },
  }
  if (apiKey !== undefined) {
    const providers = rawSection('providers')
    const existing = providers[provider]
    merged.providers = {
      ...providers,
      [provider]: {
        ...(typeof existing === 'object' && existing !== null ? (existing as RawConfig) : {}),
        apiKey,
      },
    }
  }
  const validated = ForgeConfig.safeParse(mergeConfigs(DEFAULT_CONFIG, merged))
  if (!validated.success) {
    errorWrite(
      `error: refusing to write an invalid config: ${validated.error.issues[0]?.message ?? 'validation failed'}`,
    )
    return 1
  }
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`)

  // 7. Summary
  const keyStatus =
    apiKey !== undefined
      ? ' (key saved)'
      : detected !== undefined
        ? ` (${meta.env} from environment)`
        : 'cloud' in meta && meta.cloud !== undefined
          ? ` (${meta.cloud})`
          : ` (no key — set ${meta.env} before use)`
  write('')
  write('Setup complete ✓')
  write(`  provider:    ${provider}${keyStatus}`)
  write(`  model:       ${model}`)
  write(`  theme:       ${theme}`)
  write(`  permissions: ${mode}`)
  write(`  config:      ${configPath}`)
  write('')
  write('Next steps:')
  write('  forge -p "explain this repository"   # one-shot prompt')
  write('  forge doctor                        # verify the installation')
  if (!meta.wired) {
    write('')
    write('note: the CLI model resolver currently wires anthropic, openai and google;')
    write(`      ${provider} runs once provider wiring lands (adapters exist in @forge/ai).`)
  }
  return 0
}
