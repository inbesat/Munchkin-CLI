import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '@forge/core'
import { run } from '../cli'
import { type DoctorCheck, runDoctorChecks, runDoctorCommand } from './command'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'forge-doctor-'))
}

function find(checks: DoctorCheck[], name: string): DoctorCheck {
  const check = checks.find((c) => c.name === name)
  if (!check) throw new Error(`missing check ${name}`)
  return check
}

/** Base options that keep every check hermetic. */
function base(dir: string) {
  return {
    cwd: dir,
    config: DEFAULT_CONFIG,
    configPaths: [] as string[],
    env: {} as Record<string, string | undefined>,
    tuiDir: dir,
  }
}

describe('runDoctorChecks (Phase 148)', () => {
  it('runs all seven checks with deterministic results', async () => {
    const dir = tempDir()
    const checks = await runDoctorChecks(base(dir))
    expect(checks.map((c) => c.name)).toEqual([
      'bun',
      'opentui',
      'providers',
      'mcp',
      'plugins',
      'config',
      'permissions',
    ])
    expect(find(checks, 'bun').status).toBe('ok')
    expect(find(checks, 'opentui').status).toBe('warn')
    expect(find(checks, 'providers').status).toBe('warn')
    expect(find(checks, 'mcp').status).toBe('ok')
    expect(find(checks, 'plugins').status).toBe('ok')
    expect(find(checks, 'config').status).toBe('ok')
    expect(find(checks, 'permissions').status).toBe('ok')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports the installed OpenTUI version when present', async () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'node_modules', '@opentui', 'solid'), { recursive: true })
    writeFileSync(
      join(dir, 'node_modules', '@opentui', 'solid', 'package.json'),
      JSON.stringify({ name: '@opentui/solid', version: '0.1.7' }),
    )
    const checks = await runDoctorChecks(base(dir))
    expect(find(checks, 'opentui').status).toBe('ok')
    expect(find(checks, 'opentui').detail).toContain('0.1.7')
    rmSync(dir, { recursive: true, force: true })
  })

  it('flags invalid config files and schema errors', async () => {
    const dir = tempDir()
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ broken')
    const invalid = join(dir, 'invalid.json')
    writeFileSync(invalid, JSON.stringify({ permissions: { mode: 'banana' } }))
    const checks = await runDoctorChecks({ ...base(dir), configPaths: [broken, invalid] })
    const config = find(checks, 'config')
    expect(config.status).toBe('fail')
    expect(config.detail).toContain('invalid JSON')
    expect(config.detail).toContain('permissions.mode')
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports configured providers and probes them when online', async () => {
    const dir = tempDir()
    const offline = await runDoctorChecks({
      ...base(dir),
      env: { ANTHROPIC_API_KEY: 'sk-test' },
    })
    expect(find(offline, 'providers').status).toBe('ok')
    expect(find(offline, 'providers').detail).toContain('anthropic')

    const probes: string[] = []
    const online = await runDoctorChecks({
      ...base(dir),
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      online: true,
      fetch: async (url) => {
        probes.push(url)
        return new Response('', { status: 401 })
      },
    })
    expect(find(online, 'providers').status).toBe('ok')
    expect(find(online, 'providers').detail).toContain('reachable')
    expect(probes[0]).toContain('api.anthropic.com')

    const failing = await runDoctorChecks({
      ...base(dir),
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      online: true,
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(find(failing, 'providers').status).toBe('warn')
    expect(find(failing, 'providers').detail).toContain('unreachable')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('runDoctorCommand (Phase 148)', () => {
  it('prints a human report and exits 0 when nothing fails', async () => {
    const dir = tempDir()
    const out: string[] = []
    const code = await runDoctorCommand(['doctor'], { ...base(dir), write: (l) => out.push(l) })
    expect(code).toBe(0)
    const text = out.join('\n')
    expect(text).toContain('OK')
    expect(text).toContain('checks:')
    expect(text).toContain('warn')
    rmSync(dir, { recursive: true, force: true })
  })

  it('exits 1 when a check fails', async () => {
    const dir = tempDir()
    const broken = join(dir, 'broken.json')
    writeFileSync(broken, '{ broken')
    const out: string[] = []
    const code = await runDoctorCommand(['doctor'], {
      ...base(dir),
      configPaths: [broken],
      write: (l) => out.push(l),
    })
    expect(code).toBe(1)
    expect(out.join('\n')).toContain('FAIL')
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits machine-readable JSON with --json', async () => {
    const dir = tempDir()
    const out: string[] = []
    const code = await runDoctorCommand(['doctor', '--json'], {
      ...base(dir),
      write: (l) => out.push(l),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join('\n'))
    expect(parsed.checks).toHaveLength(7)
    expect(parsed.fail).toBe(0)
    expect(parsed.passed).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('is reachable through the CLI dispatcher', async () => {
    const out: string[] = []
    const code = await run(['doctor', '--json'], { write: (l) => out.push(l) })
    expect([0, 1]).toContain(code)
    const parsed = JSON.parse(out.join('\n'))
    expect(parsed.checks.length).toBe(7)
  })
})
