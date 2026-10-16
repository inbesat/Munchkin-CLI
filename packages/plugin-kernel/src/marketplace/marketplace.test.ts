import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MarketplaceClient, parseMarketplace } from './protocol'
import { MarketplaceRegistry } from './registry'

const CATALOG = {
  updated: '2026-10-16',
  plugins: [
    {
      name: 'forge-deploy',
      repo: 'forge-workshop/forge-deploy',
      version: '1.0.0',
      description: 'Deployment helpers',
      tags: ['deploy', 'ops'],
    },
    {
      name: 'forge-lint',
      repo: 'forge-workshop/forge-lint',
      version: '2.1.0',
      description: 'Lint orchestration',
      tags: ['lint'],
    },
  ],
}

describe('parseMarketplace (Phase 110)', () => {
  it('parses a valid catalog and collects per-entry errors', () => {
    const parsed = parseMarketplace(
      JSON.stringify({
        plugins: [
          CATALOG.plugins[0],
          { version: '1.0.0' }, // missing name+repo
        ],
      }),
    )
    expect(parsed.catalog?.plugins).toHaveLength(1)
    expect(parsed.catalog?.plugins[0]?.name).toBe('forge-deploy')
    expect(parsed.errors.length).toBe(1)
  })

  it('rejects non-JSON catalogs', () => {
    const parsed = parseMarketplace('<html>')
    expect(parsed.catalog).toBeUndefined()
    expect(parsed.errors.length).toBeGreaterThan(0)
  })
})

describe('MarketplaceClient + registry (Phase 110)', () => {
  let baseDir: string
  let repoUrl: string
  let entry: { name: string; repo: string; version: string; description: string; tags: string[] }

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-market-'))
    // Real offline git repo as the plugin source (marketplace entry repo can
    // be any git URL; file:// works and needs no network).
    const pluginSrc = mkdtempSync(join(tmpdir(), 'forge-market-src-'))
    writeFileSync(
      join(pluginSrc, 'forge.plugin.json'),
      JSON.stringify({ name: 'forge-deploy', version: '1.0.0' }),
      'utf-8',
    )
    const run = (args: string[]): void => {
      const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
      const result = spawnSync('git', args, { cwd: pluginSrc, encoding: 'utf-8' })
      if (result.status !== 0) throw new Error(result.stderr)
    }
    run(['init', '--initial-branch=main'])
    run(['config', 'user.email', 't@t'])
    run(['config', 'user.name', 't'])
    run(['add', '-A'])
    run(['commit', '-m', 'initial', '--no-gpg-sign'])
    repoUrl = `file://${pluginSrc.replace(/\\/g, '/')}`
    entry = {
      name: 'forge-deploy',
      repo: repoUrl,
      version: '1.0.0',
      description: 'deploy',
      tags: ['ops'],
    }
  })

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  function clientWith(catalog: unknown): MarketplaceClient {
    return new MarketplaceClient({
      source: 'forge-workshop/plugins',
      fetchImpl: async () => new Response(JSON.stringify(catalog), { status: 200 }),
    })
  }

  it('browse + search return catalog entries', async () => {
    const client = clientWith(CATALOG)
    const browse = await client.browse()
    expect(browse.ok).toBe(true)
    expect(browse.entries?.map((e) => e.name)).toEqual(['forge-deploy', 'forge-lint'])

    const search = await client.search('deploy')
    expect(search.entries?.map((e) => e.name)).toEqual(['forge-deploy'])
  })

  it('install pins the version, records the registry entry, and the plugin loads', async () => {
    const client = clientWith({ plugins: [entry] })
    const registry = new MarketplaceRegistry(baseDir)
    const install = await client.install(
      { name: 'forge-deploy', version: '1.0.0' },
      { baseDir, currentVersion: '1.0.0' },
    )
    expect(install.ok).toBe(true)
    expect(install.dir).toBeDefined()

    const record = registry.get('forge-deploy')
    expect(record?.version).toBe('1.0.0')
    expect(existsSync(record?.dir ?? '')).toBe(true)

    // loadPlugins can now acquire it from the recorded directory.
    const { loadPluginFromDirectory } = await import('../plugin/loader')
    const loaded = loadPluginFromDirectory(record?.dir ?? '')
    expect(loaded.ok).toBe(true)
    expect(loaded.plugin?.name).toBe('forge-deploy')
  })

  it('refuses a pinned-version mismatch deterministically', async () => {
    const client = clientWith(CATALOG)
    const result = await client.install({ name: 'forge-deploy', version: '9.9.9' }, { baseDir })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('9.9.9')
  })

  it('update refreshes the pinned version when the catalog moves', async () => {
    const client = clientWith({
      updated: '2026-10-17',
      plugins: [{ ...entry, version: '2.0.0' }],
    })
    const updated = await client.update({ name: 'forge-deploy' }, { baseDir })
    expect(updated.ok).toBe(true)
    const registry = new MarketplaceRegistry(baseDir)
    expect(registry.get('forge-deploy')?.version).toBe('2.0.0')
  })

  it('uninstall removes the registry entry', () => {
    const registry = new MarketplaceRegistry(baseDir)
    expect(registry.uninstall('forge-deploy')).toBe(true)
    expect(registry.get('forge-deploy')).toBeUndefined()
  })
})
