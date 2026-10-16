import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPlugins } from './plugin/loader'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..')

function pluginPath(name: string): string {
  return join(REPO_ROOT, 'plugins', name)
}

function runHook(
  plugin: string,
  script: string,
  payload: unknown,
): {
  code: number
  stdout: string
} {
  const result = spawnSync('bun', ['run', join(pluginPath(plugin), script)], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 30_000,
  })
  return { code: result.status ?? -1, stdout: result.stdout ?? '' }
}

describe('flagship plugins (Phase 116)', () => {
  it('loads all three plugins together with no namespace conflicts', () => {
    const report = loadPlugins(
      [pluginPath('forge-security'), pluginPath('forge-format'), pluginPath('forge-test')].map(
        (path) => ({ type: 'local' as const, path }),
      ),
      { currentVersion: '1.0.0' },
    )
    expect(report.errors).toEqual([])
    expect(report.plugins.map((p) => p.namespace)).toEqual([
      'forge-security',
      'forge-format',
      'forge-test',
    ])
    expect(report.plugins.map((p) => p.plugin.parts)).toEqual([
      { hooks: true },
      { hooks: true },
      { commands: true },
    ])
  })

  it('forge-security blocks secrets and dangerous commands, allows clean payloads', () => {
    const secret = runHook('forge-security', 'hooks/pre-tool-use.ts', {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/x/config.ts',
        content: 'key = "sk-ant-api03-SECRETVALUE1234567890"',
      },
    })
    expect(secret.code).toBe(2)
    expect(secret.stdout).toContain('Anthropic API key')

    const dangerous = runHook('forge-security', 'hooks/pre-tool-use.ts', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    })
    expect(dangerous.code).toBe(2)
    expect(dangerous.stdout).toContain('dangerous command')

    const clean = runHook('forge-security', 'hooks/pre-tool-use.ts', {
      tool_name: 'Bash',
      tool_input: { command: 'bun test packages/core' },
    })
    expect(clean.code).toBe(0)
    expect(clean.stdout).toContain('"allow"')
  })

  it('forge-format invokes a formatter on the edited file and stays non-blocking', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-format-'))
    const file = join(dir, 'sample.ts')
    try {
      writeFileSync(file, 'const x = 1\n', 'utf-8')
      const result = runHook('forge-format', 'hooks/post-tool-use.ts', {
        tool_name: 'Write',
        tool_input: { file_path: file },
      })
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('formatted')

      // Unknown formatter: skip, never block.
      const unknown = runHook('forge-format', 'hooks/post-tool-use.ts', {
        tool_name: 'Write',
        tool_input: { file_path: join(dir, 'archive.zst') },
      })
      expect(unknown.code).toBe(0)
      expect(unknown.stdout).toContain('skipped')

      // Missing file: skip, never block.
      const missing = runHook('forge-format', 'hooks/post-tool-use.ts', {
        tool_name: 'Write',
        tool_input: { file_path: join(dir, 'ghost.ts') },
      })
      expect(missing.code).toBe(0)
      expect(missing.stdout).toContain('skipped')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("forge-test ships the /test slash command and doesn't break other plugins when a sibling is broken", () => {
    const testDef = pluginPath('forge-test')
    expect(loadPlugins([{ type: 'local', path: testDef }]).plugins[0]?.plugin.parts?.commands).toBe(
      true,
    )

    const broken = mkdtempSync(join(tmpdir(), 'forge-broken-'))
    try {
      mkdirSync(broken, { recursive: true })
      writeFileSync(join(broken, 'forge.plugin.json'), '{ not json', 'utf-8')
      const report = loadPlugins(
        [
          { type: 'local', path: pluginPath('forge-security') },
          { type: 'local', path: broken },
          { type: 'local', path: pluginPath('forge-format') },
        ],
        { currentVersion: '1.0.0' },
      )
      expect(report.plugins.map((p) => p.namespace)).toEqual(['forge-security', 'forge-format'])
      expect(report.errors.length).toBe(1)
    } finally {
      rmSync(broken, { recursive: true, force: true })
    }
  })
})
