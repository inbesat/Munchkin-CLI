import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPluginFromDirectory } from '../plugin/loader'
import { parsePluginManifest } from '../plugin/manifest'
import { loadSkills } from '../skills/loader'
import { MarketplaceClient, parseMarketplace } from './protocol'
import { MarketplaceRegistry } from './registry'
import {
  OFFICIAL_MARKETPLACE_URL,
  STARTER_MARKETPLACE_SOURCE,
  findStarterMarketplace,
} from './starter'

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')

describe('official starter marketplace (Phase 111)', () => {
  it('finds the committed marketplace at the repo root and exposes the hosted URL', () => {
    expect(OFFICIAL_MARKETPLACE_URL).toBe(
      `https://raw.githubusercontent.com/${STARTER_MARKETPLACE_SOURCE}/HEAD/marketplace.json`,
    )
    const found = findStarterMarketplace([process.cwd(), repoRoot])
    expect(found).toBeDefined()
    if (found === undefined) return
    expect(existsSync(found.catalogPath)).toBe(true)
  })

  it('catalog parses and lists 10+ curated plugins including the seven mandated tools', () => {
    const found = findStarterMarketplace([repoRoot])
    expect(found).toBeDefined()
    if (found === undefined) return
    const parsed = parseMarketplace(readFileSync(found.catalogPath, 'utf-8'))
    expect(parsed.errors).toEqual([])
    const names = (parsed.catalog?.plugins ?? []).map((e) => e.name)
    expect(names.length).toBeGreaterThanOrEqual(10)
    for (const mandated of [
      'security-review',
      'code-formatter',
      'test-runner',
      'doc-generator',
      'pr-reviewer',
      'deployment',
      'database-tools',
    ]) {
      expect(names).toContain(mandated)
    }
    for (const entry of parsed.catalog?.plugins ?? []) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+/)
    }
  })

  it('every catalog entry has a valid plugin manifest on disk with a matching name', () => {
    const found = findStarterMarketplace([repoRoot])
    expect(found).toBeDefined()
    if (found === undefined) return
    const parsed = parseMarketplace(readFileSync(found.catalogPath, 'utf-8'))
    for (const entry of parsed.catalog?.plugins ?? []) {
      const manifestPath = join(found.root, 'plugins', entry.name, 'forge.plugin.json')
      expect(existsSync(manifestPath)).toBe(true)
      const manifest = parsePluginManifest(readFileSync(manifestPath, 'utf-8'))
      expect(manifest.errors).toEqual([])
      expect(manifest.manifest?.name).toBe(entry.name)
      expect(manifest.manifest?.version).toBe(entry.version)
      expect(existsSync(join(found.root, 'plugins', entry.name, 'skills'))).toBe(true)
    }
  })

  it('browse + install work end-to-end through the Phase-110 client (offline, local repos)', async () => {
    const found = findStarterMarketplace([repoRoot])
    expect(found).toBeDefined()
    if (found === undefined) return
    const parsed = parseMarketplace(readFileSync(found.catalogPath, 'utf-8'))
    const catalog = parsed.catalog
    expect(catalog).toBeDefined()
    // Point each entry's repo at its committed plugin directory so the
    // acquisition path (Phase-109 loadPlugins) runs without network.
    const localCatalog = {
      ...catalog,
      plugins: (catalog?.plugins ?? []).map((e) => ({
        ...e,
        repo: join(found.root, 'plugins', e.name).replace(/\\/g, '/'),
      })),
    }
    const client = new MarketplaceClient({
      source: STARTER_MARKETPLACE_SOURCE,
      fetchImpl: async () => new Response(JSON.stringify(localCatalog), { status: 200 }),
    })

    const browse = await client.browse()
    expect(browse.ok).toBe(true)
    expect((browse.entries ?? []).length).toBeGreaterThanOrEqual(10)

    const baseDir = mkdtempSync(join(tmpdir(), 'forge-starter-'))
    try {
      const install = await client.install(
        { name: 'security-review' },
        {
          baseDir,
          currentVersion: '1.0.0',
        },
      )
      expect(install.ok).toBe(true)

      const registry = new MarketplaceRegistry(baseDir)
      const record = registry.get('security-review')
      expect(record?.version).toBe('1.0.0')

      const loaded = loadPluginFromDirectory(record?.dir ?? '')
      expect(loaded.ok).toBe(true)
      expect(loaded.plugin?.name).toBe('security-review')

      // The installed plugin ships a loadable skill.
      const skills = loadSkills({
        projectRoot: baseDir,
        pluginDirs: [join(record?.dir ?? '', 'skills')],
      })
      expect(skills.skills.some((s) => s.name === 'security-review')).toBe(true)
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })
})
