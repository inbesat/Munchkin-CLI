import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeUpdateCache } from '@forge/core'
import { run } from '../cli'
import { runUpdateCommand } from './command'

function tempCacheFile(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'forge-update-cmd-'))
  return { dir, file: join(dir, 'update-check.json') }
}

/** Registry fetch stub recording calls. */
function registryFetch(version: string, calls: string[] = []) {
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url)
      return { ok: true, status: 200, json: async () => ({ name: 'forge', version }) }
    },
  }
}

describe('runUpdateCommand (Phase 150)', () => {
  it('reports an available update with the install hint', async () => {
    const { dir, file } = tempCacheFile()
    const out: string[] = []
    const code = await runUpdateCommand(['update'], {
      write: (l) => out.push(l),
      fetch: registryFetch('0.2.0').fetch,
      cacheFile: file,
    })
    expect(code).toBe(0)
    const text = out.join('\n')
    expect(text).toContain('0.2.0')
    expect(text).toContain('npm i -g forge')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports up to date when the versions match', async () => {
    const { dir, file } = tempCacheFile()
    const out: string[] = []
    const code = await runUpdateCommand(['update'], {
      write: (l) => out.push(l),
      fetch: registryFetch('0.1.0').fetch,
      cacheFile: file,
    })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('up to date')
    rmSync(dir, { recursive: true, force: true })
  })

  it('forces a fresh check even when the cache is fresh', async () => {
    const { dir, file } = tempCacheFile()
    writeUpdateCache(file, {
      checkedAt: Date.now(),
      latestVersion: '0.1.0',
      updateAvailable: false,
    })
    const { calls, fetch } = registryFetch('0.2.0')
    await runUpdateCommand(['update'], { write: () => {}, fetch, cacheFile: file })
    expect(calls).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits machine-readable JSON with --json', async () => {
    const { dir, file } = tempCacheFile()
    const out: string[] = []
    const code = await runUpdateCommand(['update', '--json'], {
      write: (l) => out.push(l),
      fetch: registryFetch('0.2.0').fetch,
      cacheFile: file,
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join('\n'))
    expect(parsed.updateAvailable).toBe(true)
    expect(parsed.currentVersion).toBe('0.1.0')
    expect(parsed.latestVersion).toBe('0.2.0')
    rmSync(dir, { recursive: true, force: true })
  })

  it('fails with exit 1 when the check cannot run', async () => {
    const { dir, file } = tempCacheFile()
    const errors: string[] = []
    const code = await runUpdateCommand(['update'], {
      write: () => {},
      errorWrite: (l) => errors.push(l),
      fetch: async () => {
        throw new Error('offline')
      },
      cacheFile: file,
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('update check failed')
    rmSync(dir, { recursive: true, force: true })
  })

  it('is reachable through the CLI dispatcher', async () => {
    process.env.FORGE_UPDATE_ENDPOINT = 'http://127.0.0.1:1/update'
    try {
      const code = await run(['update', '--json'], { write: () => {} })
      expect(code).toBe(1)
    } finally {
      process.env.FORGE_UPDATE_ENDPOINT = undefined
    }
  })
})
