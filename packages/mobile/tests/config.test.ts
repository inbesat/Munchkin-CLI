import { describe, expect, it } from 'bun:test'
import {
  clearConnection,
  createMemoryStorage,
  loadConnection,
  saveConnection,
  validateConnectionConfig,
} from '../src/config'

const valid = {
  serverUrl: 'http://192.168.1.10:3000',
  token: 'forge-key-1',
}

describe('validateConnectionConfig', () => {
  it('accepts and normalizes a good config', () => {
    const result = validateConnectionConfig({
      serverUrl: 'http://host:3000/',
      token: '  key  ',
      name: ' home ',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.serverUrl).toBe('http://host:3000')
      expect(result.config.token).toBe('key')
      expect(result.config.name).toBe('home')
    }
  })

  it('rejects bad urls and missing tokens', () => {
    expect(validateConnectionConfig({}).ok).toBe(false)
    expect(validateConnectionConfig({ ...valid, serverUrl: 'not a url' }).ok).toBe(false)
    expect(validateConnectionConfig({ ...valid, serverUrl: 'ftp://host' }).ok).toBe(false)
    expect(validateConnectionConfig({ serverUrl: 'http://host' }).ok).toBe(false)
    expect(validateConnectionConfig({ ...valid, token: '' }).ok).toBe(false)
    expect(validateConnectionConfig(null).ok).toBe(false)
  })
})

describe('connection persistence', () => {
  it('round-trips a config through storage', async () => {
    const storage = createMemoryStorage()
    const saved = await saveConnection(storage, { ...valid, name: 'home-lab' })
    expect(saved.ok).toBe(true)

    const loaded = await loadConnection(storage)
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.config).toEqual({ ...valid, name: 'home-lab' })
    }
  })

  it('overwrites a previous connection', async () => {
    const storage = createMemoryStorage()
    await saveConnection(storage, { serverUrl: 'http://a:1', token: 'one' })
    await saveConnection(storage, { serverUrl: 'http://b:2', token: 'two' })

    const loaded = await loadConnection(storage)
    if (loaded.ok) expect(loaded.config?.serverUrl).toBe('http://b:2')
  })

  it('returns null for empty or corrupt storage (never throws)', async () => {
    const storage = createMemoryStorage()
    await storage.setItem('forge.connection', '{not json')

    const loaded = await loadConnection(storage)
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.config).toBeNull()
  })

  it('rejects saving an invalid config instead of writing it', async () => {
    const storage = createMemoryStorage()
    const result = await saveConnection(storage, { serverUrl: '', token: '' })
    expect(result.ok).toBe(false)

    const loaded = await loadConnection(storage)
    if (loaded.ok) expect(loaded.config).toBeNull()
  })

  it('clear removes the stored connection', async () => {
    const storage = createMemoryStorage()
    await saveConnection(storage, valid)
    const cleared = await clearConnection(storage)
    expect(cleared.ok).toBe(true)
    const loaded = await loadConnection(storage)
    if (loaded.ok) expect(loaded.config).toBeNull()
  })

  it('storage failures become results, not throws', async () => {
    const failing = {
      async getItem(): Promise<string | null> {
        throw new Error('kv unavailable')
      },
      async setItem(): Promise<void> {
        throw new Error('kv unavailable')
      },
      async removeItem(): Promise<void> {
        throw new Error('kv unavailable')
      },
    }
    expect((await loadConnection(failing)).ok).toBe(false)
    expect((await saveConnection(failing, valid)).ok).toBe(false)
    expect((await clearConnection(failing)).ok).toBe(false)
  })
})
