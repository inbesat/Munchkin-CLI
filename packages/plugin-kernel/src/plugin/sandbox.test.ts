import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginSandbox } from './sandbox'

describe('plugin sandbox (Phase 113)', () => {
  let pluginDir: string

  beforeAll(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'forge-sandbox-'))
    mkdirSync(join(pluginDir, 'data'), { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), '{}', 'utf-8')
  })

  afterAll(() => {
    rmSync(pluginDir, { recursive: true, force: true })
  })

  it('denies filesystem access outside the plugin directory', () => {
    const sandbox = new PluginSandbox('my-plugin', { pluginDir })
    expect(sandbox.checkPathAccess(join(pluginDir, 'manifest.json'), 'read').allowed).toBe(true)
    expect(sandbox.checkPathAccess(join(pluginDir, 'data', 'out.json'), 'write').allowed).toBe(true)

    const denied = sandbox.checkPathAccess(join(tmpdir(), 'elsewhere', 'secret.txt'), 'read')
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toContain('my-plugin')

    const userHome = sandbox.checkPathAccess(join(tmpdir(), '..', 'not-mine.txt'), 'write')
    expect(userHome.allowed).toBe(false)
  })

  it('allows extra granted roots and enforces read vs write scope', () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'forge-sandbox-data-'))
    try {
      const sandbox = new PluginSandbox('my-plugin', {
        pluginDir,
        readPaths: [dataRoot],
      })
      expect(sandbox.checkPathAccess(join(dataRoot, 'input.csv'), 'read').allowed).toBe(true)
      const writeResult = sandbox.checkPathAccess(join(dataRoot, 'output.csv'), 'write')
      expect(writeResult.allowed).toBe(false)
      expect(writeResult.reason).toContain('write')

      const writable = new PluginSandbox('my-plugin', {
        pluginDir,
        readPaths: [dataRoot],
        writePaths: [dataRoot],
      })
      expect(writable.checkPathAccess(join(dataRoot, 'output.csv'), 'write').allowed).toBe(true)
      // Traversal escapes are caught after normalization.
      expect(
        writable.checkPathAccess(join(dataRoot, '..', '..', 'escape.txt'), 'write').allowed,
      ).toBe(false)
    } finally {
      rmSync(dataRoot, { recursive: true, force: true })
    }
  })

  it('denies shell commands unless explicitly granted, and enforces the allowlist prefix', () => {
    const sandbox = new PluginSandbox('my-plugin', { pluginDir })
    const denied = sandbox.checkCommand('rm -rf /')
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toContain('my-plugin')

    const granted = new PluginSandbox('my-plugin', {
      pluginDir,
      commands: ['git status', 'git *', 'npm test'],
    })
    expect(granted.checkCommand('git status').allowed).toBe(true)
    expect(granted.checkCommand('git push origin main').allowed).toBe(true)
    expect(granted.checkCommand('gitk').allowed).toBe(false)
    expect(granted.checkCommand('npm test -- --watch').allowed).toBe(true)
    expect(granted.checkCommand('rm -rf /').allowed).toBe(false)
  })

  it('denies API keys and env secrets unless their scope is granted', () => {
    const sandbox = new PluginSandbox('my-plugin', { pluginDir })
    const denied = sandbox.checkSecret('GITHUB_TOKEN')
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toContain('my-plugin')

    const granted = new PluginSandbox('my-plugin', {
      pluginDir,
      secretScopes: ['GITHUB_TOKEN', 'OPENAI_*'],
    })
    expect(granted.checkSecret('GITHUB_TOKEN').allowed).toBe(true)
    expect(granted.checkSecret('OPENAI_API_KEY').allowed).toBe(true)
    expect(granted.checkSecret('ANTHROPIC_API_KEY').allowed).toBe(false)
    expect(granted.checkSecret('FORGE_CONFIG_PATH').allowed).toBe(false)
  })

  it('derives grants from the plugin directory plus a manifest sandbox section', () => {
    const sandbox = PluginSandbox.fromManifest('my-plugin', pluginDir, {
      readPaths: ['/etc/forge'],
      secretScopes: ['GITHUB_*'],
    })
    expect(sandbox.checkPathAccess(join(pluginDir, 'manifest.json'), 'read').allowed).toBe(true)
    expect(sandbox.checkPathAccess('/etc/forge/policy.json', 'read').allowed).toBe(true)
    expect(sandbox.checkSecret('GITHUB_PAT').allowed).toBe(true)
    expect(sandbox.checkSecret('AWS_SECRET').allowed).toBe(false)
  })
})
