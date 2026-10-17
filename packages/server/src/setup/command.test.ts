import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODEL_SUGGESTIONS, type SetupAsk, runSetupCommand } from './command'

const temps: string[] = []

function tempConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-setup-'))
  temps.push(dir)
  return join(dir, 'config.json')
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function scriptedAsk(answers: (string | null)[]) {
  const calls: string[] = []
  const ask: SetupAsk = async (question) => {
    calls.push(question)
    const next = answers.shift()
    return next === undefined ? '' : next
  }
  return { ask, calls }
}

function collector() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

describe('forge setup (Phase 151)', () => {
  it('walks provider -> key -> model -> theme -> permissions and writes the config', async () => {
    const configPath = tempConfig()
    const out = collector()
    const err = collector()
    const { ask, calls } = scriptedAsk(['', '', 'claude-opus-4-20250514', 'light', 'auto'])

    const code = await runSetupCommand(['setup'], {
      configPath,
      write: out.write,
      errorWrite: err.write,
      ask,
      env: { ANTHROPIC_API_KEY: 'sk-env' },
    })

    expect(code).toBe(0)
    expect(calls.length).toBe(5)
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.model).toEqual({ provider: 'anthropic', model: 'claude-opus-4-20250514' })
    expect(config.theme.name).toBe('light')
    expect(config.permissions.mode).toBe('auto')
    // Environment variable detected: nothing stored, the runtime reads the env.
    expect(config.providers?.anthropic?.apiKey).toBeUndefined()
    const text = out.lines.join('\n')
    expect(text).toContain('ANTHROPIC_API_KEY')
    expect(text).toContain('Setup complete')
  })

  it('stores a pasted API key in the config for the chosen provider', async () => {
    const configPath = tempConfig()
    const out = collector()
    const { ask } = scriptedAsk(['2', 'sk-test-key', '', '', ''])

    const code = await runSetupCommand(['setup'], {
      configPath,
      write: out.write,
      errorWrite: () => {},
      ask,
      env: {},
    })

    expect(code).toBe(0)
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.model.provider).toBe('openai')
    expect(config.model.model).toBe(MODEL_SUGGESTIONS.openai?.[0] as string)
    expect(config.providers.openai.apiKey).toBe('sk-test-key')
    expect(config.theme.name).toBe('dark')
    expect(config.permissions.mode).toBe('ask')
  })

  it('preserves unrelated keys already present in the config', async () => {
    const configPath = tempConfig()
    writeFileSync(
      configPath,
      JSON.stringify({
        telemetry: { enabled: true },
        custom: 42,
        model: { provider: 'google', model: 'gemini-2.5-pro' },
      }),
    )
    const { ask } = scriptedAsk(['', '', '', '', ''])

    const code = await runSetupCommand(['setup'], {
      configPath,
      write: () => {},
      errorWrite: () => {},
      ask,
      env: {},
    })

    expect(code).toBe(0)
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.telemetry.enabled).toBe(true)
    expect(config.custom).toBe(42)
    expect(config.model.provider).toBe('google')
    expect(config.model.model).toBe('gemini-2.5-pro')
  })

  it('refuses to touch a config file that is not valid JSON', async () => {
    const configPath = tempConfig()
    writeFileSync(configPath, 'not json')
    const err = collector()

    const code = await runSetupCommand(['setup', '--yes'], {
      configPath,
      write: () => {},
      errorWrite: err.write,
      ask: async () => {
        throw new Error('ask must not be called with --yes')
      },
      env: {},
    })

    expect(code).toBe(1)
    expect(err.lines.join('\n')).toContain('invalid JSON')
    expect(readFileSync(configPath, 'utf8')).toBe('not json')
  })

  it('skips every prompt with --yes and uses defaults', async () => {
    const configPath = tempConfig()
    const out = collector()

    const code = await runSetupCommand(['setup', '--yes'], {
      configPath,
      write: out.write,
      errorWrite: () => {},
      ask: async () => {
        throw new Error('ask must not be called with --yes')
      },
      env: { OPENAI_API_KEY: 'sk-env' },
    })

    expect(code).toBe(0)
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.model.provider).toBe('anthropic')
    expect(config.model.model).toBe(MODEL_SUGGESTIONS.anthropic?.[0] as string)
    expect(config.theme.name).toBe('dark')
    expect(config.permissions.mode).toBe('ask')
    expect(out.lines.join('\n')).toContain('Setup complete')
  })

  it('skips the API key prompt for cloud-credential providers', async () => {
    const configPath = tempConfig()
    const out = collector()
    const { ask, calls } = scriptedAsk(['5', '', '', ''])

    const code = await runSetupCommand(['setup'], {
      configPath,
      write: out.write,
      errorWrite: () => {},
      ask,
      env: {},
    })

    expect(code).toBe(0)
    expect(calls.length).toBe(4)
    expect(out.lines.join('\n')).toContain('AWS credentials')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(config.model.provider).toBe('bedrock')
    expect(config.providers?.bedrock?.apiKey).toBeUndefined()
  })

  it('aborts without writing when the user cancels', async () => {
    const configPath = tempConfig()
    const err = collector()
    const { ask } = scriptedAsk([null])

    const code = await runSetupCommand(['setup'], {
      configPath,
      write: () => {},
      errorWrite: err.write,
      ask,
      env: {},
    })

    expect(code).toBe(1)
    expect(err.lines.join('\n')).toContain('cancelled')
    expect(existsSync(configPath)).toBe(false)
  })
})
