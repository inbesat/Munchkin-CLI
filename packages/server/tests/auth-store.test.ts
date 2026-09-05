import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthStore, AUTH_KEY_PREFIX } from '../src/auth/store'

let baseDir: string
let store: AuthStore

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'forge-auth-'))
  store = new AuthStore({ baseDir })
})

afterEach(() => {
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('AuthStore (Phase 81)', () => {
  it('mints keys with the frg_ prefix and a stable public id', async () => {
    const { metadata, secret } = await store.createKey({ name: 'ci-deploy' })
    expect(secret.startsWith(AUTH_KEY_PREFIX)).toBe(true)
    expect(metadata.id).toMatch(/^[a-f0-9]{16}$/)
    expect(metadata.name).toBe('ci-deploy')
    expect(metadata.env).toBe('live')
    expect(metadata.scopes).toEqual(['*'])
  })

  it('persists hashed keys (not the secrets) to keys.json', async () => {
    const { metadata, secret } = await store.createKey({ name: 'a' })
    const file = join(baseDir, 'keys.json')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf-8')
    expect(text).toContain(metadata.id)
    expect(text).not.toContain(secret) // never write the secret
    expect(text).toMatch(/[a-f0-9]{64}/) // hash, not raw secret
  })

  it('validates a presented key and returns the metadata', async () => {
    const { metadata, secret } = await store.createKey({ name: 'svc' })
    const result = await store.validate(secret)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.key.id).toBe(metadata.id)
      expect(result.key.name).toBe('svc')
      expect(typeof result.key.lastUsedAt).toBe('number')
    }
  })

  it('rejects missing / malformed / unknown / wrong tokens with typed reasons', async () => {
    const { secret } = await store.createKey({ name: 'k' })
    expect((await store.validate(undefined)).reason).toBe('missing')
    expect((await store.validate('Bearer abc')).reason).toBe('malformed')
    expect((await store.validate(`${AUTH_KEY_PREFIX}live_AAAA`)).reason).toBe('unknown')
    // Wrong: same id collision is essentially impossible, but the hash check still catches tampering.
    const tampered = `${secret.slice(0, -1)}X`
    expect((await store.validate(tampered)).reason).toBe('unknown')
  })

  it('revokes a key and re-validating it returns unknown', async () => {
    const { metadata, secret } = await store.createKey({ name: 'r' })
    expect((await store.validate(secret)).ok).toBe(true)
    expect(await store.revokeKey(metadata.id)).toBe(true)
    expect((await store.validate(secret)).reason).toBe('unknown')
    expect(await store.revokeKey(metadata.id)).toBe(false)
  })

  it('enforces per-key rate limits via a token bucket', async () => {
    // Capacity 2, refill 0.1/s → first 2 requests pass, 3rd fails.
    const { secret } = await store.createKey({
      name: 'rl',
      rateLimit: { capacity: 2, refillPerSec: 0.1 },
    })
    expect((await store.validate(secret)).ok).toBe(true)
    expect((await store.validate(secret)).ok).toBe(true)
    const r = await store.validate(secret)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('rate-limited')
  })

  it('rate-limits independently per key (one key can\'t starve another)', async () => {
    const a = await store.createKey({ name: 'a', rateLimit: { capacity: 1, refillPerSec: 0.1 } })
    const b = await store.createKey({ name: 'b', rateLimit: { capacity: 1, refillPerSec: 0.1 } })
    expect((await store.validate(a.secret)).ok).toBe(true)
    expect((await store.validate(b.secret)).ok).toBe(true) // separate bucket
    expect((await store.validate(a.secret)).ok).toBe(false) // a exhausted
    expect((await store.validate(b.secret)).ok).toBe(false) // b exhausted
  })

  it('persists across instances (load on a fresh store reads the same file)', async () => {
    const { metadata, secret } = await store.createKey({ name: 'persist' })
    const store2 = new AuthStore({ baseDir })
    await store2.load()
    const result = await store2.validate(secret)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.key.id).toBe(metadata.id)
    const list = await store2.listKeys()
    expect(list).toHaveLength(1)
  })

  it('listKeys returns metadata without the hash or secret', async () => {
    await store.createKey({ name: 'one' })
    await store.createKey({ name: 'two', env: 'ci' })
    const list = await store.listKeys()
    expect(list).toHaveLength(2)
    for (const k of list) {
      expect(k).not.toHaveProperty('hash')
      expect(k).not.toHaveProperty('secret')
      expect(k.id).toMatch(/^[a-f0-9]{16}$/)
    }
    expect(list.find((k) => k.name === 'two')?.env).toBe('ci')
  })

  it('rateLimitState reports per-key token counts', async () => {
    const a = await store.createKey({ name: 'a', rateLimit: { capacity: 5, refillPerSec: 0 } })
    expect((await store.validate(a.secret)).ok).toBe(true) // consumes 1
    const state = store.rateLimitState()
    expect(state).toHaveLength(1)
    expect(state[0]?.id).toBe(a.metadata.id)
    expect(state[0]?.capacity).toBe(5)
    expect(state[0]?.tokens).toBeLessThan(5)
  })

  it('hasKeys reflects state for the dev-convenience middleware', async () => {
    expect(await store.hasKeys()).toBe(false)
    await store.createKey({ name: 'x' })
    expect(await store.hasKeys()).toBe(true)
  })

  it('reset wipes all keys', async () => {
    await store.createKey({ name: 'one' })
    await store.createKey({ name: 'two' })
    expect(await store.hasKeys()).toBe(true)
    await store.reset()
    expect(await store.hasKeys()).toBe(false)
  })
})
