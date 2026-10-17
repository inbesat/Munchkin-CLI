import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkForUpdate,
  compareVersions,
  formatUpdateNotice,
  readUpdateCache,
  refreshUpdateCache,
  updateNotice,
  writeUpdateCache,
} from './index'

const HOUR = 3_600_000

function tempCache(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'forge-update-'))
  return { dir, file: join(dir, 'update-check.json') }
}

/** Fetch stub returning a registry-style `{ version }` payload. */
function versionFetch(version: string, calls: string[] = []) {
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: 'forge', version }),
      }
    },
  }
}

describe('compareVersions (Phase 150)', () => {
  it('orders numeric segments, not strings', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.1', '0.1.0')).toBe(0)
  })

  it('tolerates a v prefix and treats prereleases as older', () => {
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('0.2.0', '0.2.0-rc.2')).toBeGreaterThan(0)
  })
})

describe('checkForUpdate (Phase 150)', () => {
  it('serves a fresh cache without fetching', async () => {
    const { dir, file } = tempCache()
    writeUpdateCache(file, { checkedAt: 1_000, latestVersion: '0.9.0', updateAvailable: true })
    const { calls, fetch } = versionFetch('9.9.9')
    const result = await checkForUpdate({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch,
      now: () => 2_000,
    })
    expect(calls).toHaveLength(0)
    expect(result).toEqual({
      currentVersion: '0.1.0',
      latestVersion: '0.9.0',
      updateAvailable: true,
      checkedAt: 1_000,
    })
    rmSync(dir, { recursive: true, force: true })
  })

  it('fetches when the cache is stale and records the result', async () => {
    const { dir, file } = tempCache()
    writeUpdateCache(file, { checkedAt: 0, latestVersion: '0.1.0', updateAvailable: false })
    const { calls, fetch } = versionFetch('0.2.0')
    const result = await checkForUpdate({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch,
      now: () => 25 * HOUR,
    })
    expect(calls).toEqual(['https://registry.npmjs.org/forge/latest'])
    expect(result.updateAvailable).toBe(true)
    expect(result.latestVersion).toBe('0.2.0')
    const cached = readUpdateCache(file)
    expect(cached?.latestVersion).toBe('0.2.0')
    expect(cached?.checkedAt).toBe(25 * HOUR)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports no update when the current version is up to date', async () => {
    const { dir, file } = tempCache()
    const { fetch } = versionFetch('0.1.0')
    const result = await checkForUpdate({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch,
      now: () => 1_000,
    })
    expect(result.updateAvailable).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects on fetch failures and malformed payloads', async () => {
    const { dir, file } = tempCache()
    await expect(
      checkForUpdate({
        currentVersion: '0.1.0',
        cacheFile: file,
        fetch: async () => {
          throw new Error('offline')
        },
      }),
    ).rejects.toThrow('offline')
    await expect(
      checkForUpdate({
        currentVersion: '0.1.0',
        cacheFile: file,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) }),
      }),
    ).rejects.toThrow('version')
    rmSync(dir, { recursive: true, force: true })
  })

  it('uses a custom endpoint when given', async () => {
    const { dir, file } = tempCache()
    const { calls, fetch } = versionFetch('0.2.0')
    await checkForUpdate({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch,
      endpoint: 'https://example.test/latest',
    })
    expect(calls).toEqual(['https://example.test/latest'])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('updateNotice (Phase 150)', () => {
  it('is null without a cached update', () => {
    const { dir, file } = tempCache()
    expect(updateNotice({ currentVersion: '0.1.0', cacheFile: file })).toBeNull()
    writeUpdateCache(file, { checkedAt: 1_000, latestVersion: '0.1.0', updateAvailable: false })
    expect(updateNotice({ currentVersion: '0.1.0', cacheFile: file })).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the notice once, then throttles for a day', () => {
    const { dir, file } = tempCache()
    writeUpdateCache(file, { checkedAt: 1_000, latestVersion: '0.2.0', updateAvailable: true })
    const notice = updateNotice({
      currentVersion: '0.1.0',
      cacheFile: file,
      now: () => 2_000,
    })
    expect(notice).toContain('0.2.0')
    expect(notice).toContain('0.1.0')
    expect(notice).toContain('npm i -g forge')
    expect(readUpdateCache(file)?.notifiedAt).toBe(2_000)
    expect(
      updateNotice({ currentVersion: '0.1.0', cacheFile: file, now: () => 2_000 + HOUR }),
    ).toBeNull()
    expect(
      updateNotice({ currentVersion: '0.1.0', cacheFile: file, now: () => 2_000 + 25 * HOUR }),
    ).toContain('0.2.0')
    rmSync(dir, { recursive: true, force: true })
  })

  it('formats the notice text', () => {
    expect(
      formatUpdateNotice({
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
        updateAvailable: true,
        checkedAt: 0,
      }),
    ).toBe('forge 0.2.0 is available (current 0.1.0). Update: npm i -g forge')
    expect(
      formatUpdateNotice({
        currentVersion: '0.1.0',
        latestVersion: '0.1.0',
        updateAvailable: false,
        checkedAt: 0,
      }),
    ).toBeNull()
  })
})

describe('refreshUpdateCache (Phase 150)', () => {
  it('skips fresh caches and refreshes stale ones', async () => {
    const { dir, file } = tempCache()
    writeUpdateCache(file, { checkedAt: 1_000, latestVersion: '0.1.0', updateAvailable: false })
    const fresh = versionFetch('0.2.0')
    await refreshUpdateCache({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch: fresh.fetch,
      now: () => 2_000,
    })
    expect(fresh.calls).toHaveLength(0)

    const stale = versionFetch('0.2.0')
    const result = await refreshUpdateCache({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch: stale.fetch,
      now: () => 25 * HOUR,
    })
    expect(stale.calls).toHaveLength(1)
    expect(result?.latestVersion).toBe('0.2.0')
    rmSync(dir, { recursive: true, force: true })
  })

  it('swallows failures and returns null', async () => {
    const { dir, file } = tempCache()
    const result = await refreshUpdateCache({
      currentVersion: '0.1.0',
      cacheFile: file,
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(result).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('update cache file (Phase 150)', () => {
  it('round-trips and rejects garbage', () => {
    const { dir, file } = tempCache()
    expect(readUpdateCache(file)).toBeNull()
    writeUpdateCache(file, { checkedAt: 5, latestVersion: '1.0.0', updateAvailable: true })
    expect(readUpdateCache(file)).toEqual({
      checkedAt: 5,
      latestVersion: '1.0.0',
      updateAvailable: true,
    })
    expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true)
    writeFileSync(file, '{ broken')
    expect(readUpdateCache(file)).toBeNull()
    writeFileSync(file, JSON.stringify({ latestVersion: 'x' }))
    expect(readUpdateCache(file)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
