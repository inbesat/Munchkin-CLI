import { afterEach, describe, expect, it } from 'bun:test'
import { createModelResolver, expandKeyReference } from './model-resolver'

const savedAnthropic = process.env.ANTHROPIC_API_KEY
const savedGoogle = process.env.GOOGLE_API_KEY

afterEach(() => {
  restore('ANTHROPIC_API_KEY', savedAnthropic)
  restore('GOOGLE_API_KEY', savedGoogle)
})

function restore(name: string, value: string | undefined): void {
  // `process.env.X = undefined` stores the literal string 'undefined' in Bun.
  if (value === undefined) Reflect.deleteProperty(process.env, name)
  else process.env[name] = value
}

describe('model resolver credential fallback (Phase 151)', () => {
  it('expands $ENV_VAR config references', () => {
    expect(expandKeyReference('$MY_KEY', { MY_KEY: 'sk-x' })).toBe('sk-x')
    expect(expandKeyReference('sk-literal')).toBe('sk-literal')
    expect(expandKeyReference('$MISSING', {})).toBeUndefined()
  })

  it('fails with a clear error when no key is available anywhere', async () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY')
    const resolve = createModelResolver({ configKeyLookup: () => undefined })
    await expect(resolve('anthropic/claude-sonnet-4-20250514')).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('uses a config-stored key when env and options are empty', async () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY')
    const resolve = createModelResolver({
      configKeyLookup: (provider) => (provider === 'anthropic' ? 'sk-config' : undefined),
    })
    const model = await resolve('anthropic/claude-sonnet-4-20250514')
    expect(model.id).toBe('anthropic/claude-sonnet-4-20250514')
  })

  it('applies the lookup per provider', async () => {
    Reflect.deleteProperty(process.env, 'GOOGLE_API_KEY')
    const resolve = createModelResolver({
      configKeyLookup: (provider) => (provider === 'google' ? 'g-key' : undefined),
    })
    const model = await resolve('google/gemini-2.5-pro')
    expect(model.id).toContain('gemini-2.5-pro')
  })
})
