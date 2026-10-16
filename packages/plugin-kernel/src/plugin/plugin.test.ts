import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PLUGIN_MANIFEST_FILE, describePluginFormat } from './format'
import { loadPlugin, parsePluginManifest } from './manifest'

let validPlugin: string

const VALID_MANIFEST = {
  name: 'forge-test-plugin',
  version: '1.2.0',
  description: 'A sample forge plugin.',
  author: 'forge-tester',
  parts: {
    skills: true,
    hooks: true,
    agents: true,
    mcp: true,
    commands: true,
  },
}

beforeAll(() => {
  validPlugin = mkdtempSync(join(tmpdir(), 'forge-plugin-'))
  writeFileSync(join(validPlugin, PLUGIN_MANIFEST_FILE), JSON.stringify(VALID_MANIFEST), 'utf-8')
  for (const dir of ['skills', 'hooks', 'agents', 'mcp', 'commands']) {
    mkdirSync(join(validPlugin, dir), { recursive: true })
  }
  writeFileSync(
    join(validPlugin, 'skills', 'SKILL.md'),
    '---\nname: sample-skill\ndescription: sample\n---\n\ndo sample things',
    'utf-8',
  )
})

afterAll(() => {
  rmSync(validPlugin, { recursive: true, force: true })
})

describe('plugin format (Phase 108)', () => {
  it('defines the layout: manifest + five part directories', () => {
    const format = describePluginFormat()
    expect(format.manifestFile).toBe('forge.plugin.json')
    expect(format.directories).toEqual(['skills', 'hooks', 'agents', 'mcp', 'commands'])
    // Documentation deliverable: the format description is non-empty.
    expect(format.documented.length).toBeGreaterThan(200)
  })

  it('parses a valid manifest', () => {
    const parsed = parsePluginManifest(JSON.stringify(VALID_MANIFEST))
    expect(parsed.manifest?.name).toBe('forge-test-plugin')
    expect(parsed.manifest?.version).toBe('1.2.0')
    expect(parsed.manifest?.parts?.commands).toBe(true)
    expect(parsed.errors).toEqual([])
  })

  it('collects manifest validation errors instead of throwing', () => {
    for (const [label, raw] of [
      ['not json', '{ broken'],
      ['missing name', JSON.stringify({ version: '1.0.0' })],
      ['missing version', JSON.stringify({ name: 'x' })],
      ['wrong types', JSON.stringify({ name: 'x', version: 3, description: 7 })],
    ] as const) {
      const parsed = parsePluginManifest(raw)
      expect(parsed.manifest).toBeUndefined()
      expect(parsed.errors.length).toBeGreaterThan(0)
      void label
    }
  })
})

describe('loadPlugin (Phase 108)', () => {
  it('loads the sample plugin: manifest + discovered parts', () => {
    const loaded = loadPlugin(validPlugin)
    expect(loaded.ok).toBe(true)
    expect(loaded.manifest?.name).toBe('forge-test-plugin')
    expect(loaded.parts.skills).toBe(true) // declared and present
    expect(loaded.presentDirs).toContain('skills')
  })

  it('reports missing manifest', () => {
    const empty = mkdtempSync(join(tmpdir(), 'forge-plugin-empty-'))
    try {
      const loaded = loadPlugin(empty)
      expect(loaded.ok).toBe(false)
      expect(loaded.errors.length).toBeGreaterThan(0)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
