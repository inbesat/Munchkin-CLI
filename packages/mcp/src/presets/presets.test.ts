import { afterAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CONNECTOR_PRESETS,
  McpPresetsConfig,
  getPreset,
  installPreset,
  resolveServerSpec,
} from './index'

const ALL_IDS = ['github', 'context7', 'playwright', 'filesystem', 'memory', 'sequential-thinking']

describe('bundled connector presets (Phase 121)', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  function tempConfig(): McpPresetsConfig {
    const dir = mkdtempSync(join(tmpdir(), 'forge-presets-'))
    dirs.push(dir)
    return new McpPresetsConfig({ directory: dir }.directory)
  }

  it('bundles the six common connector presets with server commands', () => {
    expect(CONNECTOR_PRESETS.map((p) => p.id)).toEqual(ALL_IDS)
    for (const preset of CONNECTOR_PRESETS) {
      expect(preset.command.length).toBeGreaterThan(0)
      expect(preset.baseArgs.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
      expect(preset.docsUrl).toContain('http')
    }
    expect(getPreset('github')?.baseArgs).toContain('@modelcontextprotocol/server-github')
  })

  it('filesystem preset requires its root argument in the resolved spec', () => {
    const preset = getPreset('filesystem')
    expect(preset).toBeDefined()
    if (preset === undefined) return
    const withoutRoot = resolveServerSpec(preset, [])
    expect(withoutRoot.ok).toBe(false)
    if (!withoutRoot.ok) expect(withoutRoot.error).toContain('root')

    const withRoot = resolveServerSpec(preset, ['/tmp/project'])
    expect(withRoot.ok).toBe(true)
    if (withRoot.ok) {
      expect(withRoot.spec.args).toContain('/tmp/project')
      expect(withRoot.spec.command).toBe('npx')
    }
  })

  it('installs a preset in one command and reads it back from the config file', () => {
    const config = tempConfig()
    const result = installPreset('memory', config)
    expect(result.ok).toBe(true)
    expect(config.isInstalled('memory')).toBe(true)

    const raw = JSON.parse(readFileSync(join(dirs[0] ?? '', 'mcp-servers.json'), 'utf-8')) as {
      memory: { command: string; args: string[] }
    }
    expect(raw.memory.command).toBe('npx')
    expect(raw.memory.args).toContain('@modelcontextprotocol/server-memory')
    expect(existsSync(join(dirs[0] ?? '', 'mcp-servers.json'))).toBe(true)
  })

  it('resolves required env at install time and warns when unset', () => {
    const previous = process.env.GITHUB_TOKEN_TEST_PROBE
    process.env.GITHUB_TOKEN_TEST_PROBE = 'present'
    const preset = getPreset('github')
    expect(preset).toBeDefined()
    if (preset === undefined) return
    // Probe with a preset-shaped env requirement via resolveServerSpec on a
    // modified copy (avoid mutating the bundled preset).
    const custom = { ...preset, requiredEnv: ['GITHUB_TOKEN_TEST_PROBE'] }
    const resolved = resolveServerSpec(custom, [])
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.spec.env.GITHUB_TOKEN_TEST_PROBE).toBe('present')

    const customMissing = { ...preset, requiredEnv: ['GITHUB_TOKEN_DEFINITELY_UNSET_XYZ'] }
    const warned = resolveServerSpec(customMissing, [])
    expect(warned.ok).toBe(true)
    if (warned.ok)
      expect(warned.warnings.some((w) => w.includes('GITHUB_TOKEN_DEFINITELY_UNSET_XYZ'))).toBe(
        true,
      )
    process.env.GITHUB_TOKEN_TEST_PROBE = previous
  })

  it('rejects unknown presets and merges repeated installs by id', () => {
    const config = tempConfig()
    const unknown = installPreset('not-a-connector', config)
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) {
      expect(unknown.error).toContain('not-a-connector')
      expect(unknown.error).toContain('available:')
    }

    expect(installPreset('context7', config).ok).toBe(true)
    expect(installPreset('context7', config).ok).toBe(true)
    expect(config.installedIds().filter((id) => id === 'context7')).toHaveLength(1)
    expect(config.installedIds()).toEqual(['context7'])
  })
})
