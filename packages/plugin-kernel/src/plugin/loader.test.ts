import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadPluginFromDirectory,
  loadPluginFromNpm,
  loadPlugins,
  satisfiesForgeVersion,
} from './loader'

const manifestFor = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version: '1.0.0', description: `${name} plugin`, ...extra })

let root: string
let npmRoot: string
let localDir: string
let npmDir: string
let brokenDir: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-pl-'))
  npmRoot = join(root, 'node_modules')
  localDir = join(root, 'plugins', 'local-a')
  npmDir = join(npmRoot, 'forge-npm-a')
  brokenDir = join(root, 'plugins', 'broken-b')
  mkdirSync(localDir, { recursive: true })
  mkdirSync(npmDir, { recursive: true })
  mkdirSync(brokenDir, { recursive: true })
  writeFileSync(join(localDir, 'forge.plugin.json'), manifestFor('local-a'), 'utf-8')
  writeFileSync(join(npmDir, 'forge.plugin.json'), manifestFor('forge-npm-a'), 'utf-8')
  writeFileSync(join(brokenDir, 'forge.plugin.json'), 'nope{', 'utf-8')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('satisfiesForgeVersion', () => {
  it('handles exact, >=, ^, and * constraints', () => {
    expect(satisfiesForgeVersion('1.0.0', '1.0.0')).toBe(true)
    expect(satisfiesForgeVersion('>=0.1.0', '1.0.0')).toBe(true)
    expect(satisfiesForgeVersion('>=99.0.0', '1.0.0')).toBe(false)
    expect(satisfiesForgeVersion('^1.0.0', '1.2.0')).toBe(true)
    expect(satisfiesForgeVersion('^2.0.0', '1.2.0')).toBe(false)
    expect(satisfiesForgeVersion('*', '1.2.0')).toBe(true)
  })
})

describe('plugin loading from sources (Phase 109)', () => {
  it('loads a local-path plugin', () => {
    const loaded = loadPluginFromDirectory(localDir, 'local')
    expect(loaded.ok).toBe(true)
    expect(loaded.plugin?.name).toBe('local-a')
    expect(loaded.namespace).toBe('local-a')
  })

  it('loads an npm-style plugin from node_modules layout', () => {
    const loaded = loadPluginFromNpm('forge-npm-a', { searchRoots: [root] })
    expect(loaded.ok).toBe(true)
    expect(loaded.plugin?.name).toBe('forge-npm-a')
  })

  it('isolates a broken plugin: siblings still load', () => {
    const report = loadPlugins(
      [
        { type: 'local', path: localDir },
        { type: 'local', path: brokenDir },
      ],
      { currentVersion: '1.0.0' },
    )
    expect(report.plugins).toHaveLength(1)
    expect(report.plugins[0]?.plugin?.name).toBe('local-a')
    expect(report.errors.length).toBe(1)
    expect(report.errors[0]?.reason.length).toBeGreaterThan(0)
  })
})

describe('loadPlugins orchestration (Phase 109)', () => {
  it('reports version incompatibility as an error', () => {
    const dir = join(root, 'plugins', 'needs-newer')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'forge.plugin.json'),
      manifestFor('needs-newer', { forgeVersion: '>=99.0.0' }),
      'utf-8',
    )
    const report = loadPlugins([{ type: 'local', path: dir }], { currentVersion: '1.0.0' })
    expect(report.plugins).toHaveLength(0)
    expect(report.errors[0]?.reason).toContain('forgeVersion')
  })

  it('prevents namespace conflicts: duplicate names raise conflicts, not double loads', () => {
    const dir = join(root, 'plugins', 'dup')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'forge.plugin.json'), manifestFor('local-a'), 'utf-8')
    const report = loadPlugins(
      [
        { type: 'local', path: localDir },
        { type: 'local', path: dir },
      ],
      { currentVersion: '1.0.0' },
    )
    expect(report.plugins).toHaveLength(1)
    expect(report.errors.some((e) => /already loaded/i.test(e.reason))).toBe(true)
  })

  it('missing npm package reports an isolated error', () => {
    const report = loadPlugins(
      [{ type: 'npm', package: 'forge-not-installed', searchRoots: [root] }],
      { currentVersion: '1.0.0' },
    )
    expect(report.plugins).toHaveLength(0)
    expect(report.errors[0]?.reason).toContain('forge-not-installed')
  })

  it('git clone failure reports an isolated error (offline by default)', () => {
    const report = loadPlugins(
      [{ type: 'git', repo: 'https://example.test/nope.git', cacheDir: join(root, 'git-cache') }],
      { currentVersion: '1.0.0' },
    )
    expect(report.plugins).toHaveLength(0)
    expect(report.errors[0]?.reason.length).toBeGreaterThan(0)
  })

  it('git source with injectable clone loads the plugin', () => {
    const cacheDir = join(root, 'git-cache-injected')
    const report = loadPlugins([{ type: 'git', repo: 'https://example.test/fake.git', cacheDir }], {
      currentVersion: '1.0.0',
      clone: (repo, target) => {
        mkdirSync(target, { recursive: true })
        writeFileSync(join(target, 'forge.plugin.json'), manifestFor('from-git'), 'utf-8')
        void repo
        return { ok: true, stderr: '' }
      },
    })
    expect(report.plugins).toHaveLength(1)
    expect(report.plugins[0]?.plugin?.name).toBe('from-git')
    expect(existsSync(cacheDir)).toBe(true)
  })
})
