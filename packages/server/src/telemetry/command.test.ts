import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../cli'
import { runTelemetryCommand } from './command'

/** Temp project dir with an optional `.forge/settings.json` telemetry value. */
function tempProject(telemetryEnabled?: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-telemetry-cmd-'))
  if (telemetryEnabled !== undefined) {
    mkdirSync(join(dir, '.forge'), { recursive: true })
    writeFileSync(
      join(dir, '.forge', 'settings.json'),
      JSON.stringify({ telemetry: { enabled: telemetryEnabled } }),
    )
  }
  return dir
}

describe('runTelemetryCommand (Phase 147)', () => {
  it('reports the effective state and what is sent', async () => {
    const out: string[] = []
    const cwd = tempProject(false)
    const code = await runTelemetryCommand(['telemetry', 'status'], {
      write: (l) => out.push(l),
      cwd,
    })
    expect(code).toBe(0)
    const text = out.join('\n')
    expect(text).toContain('telemetry: off')
    expect(text).toContain('privacy')
    rmSync(cwd, { recursive: true, force: true })
  })

  it('shows enabled when the config enables it', async () => {
    const out: string[] = []
    const cwd = tempProject(true)
    const code = await runTelemetryCommand(['telemetry', 'status'], {
      write: (l) => out.push(l),
      cwd,
    })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('telemetry: on')
    rmSync(cwd, { recursive: true, force: true })
  })

  it('enables telemetry in the global config without clobbering other keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-telemetry-global-'))
    const file = join(dir, 'settings.json')
    writeFileSync(file, JSON.stringify({ model: { model: 'claude-sonnet-4-6' } }))
    const out: string[] = []
    const code = await runTelemetryCommand(['telemetry', 'on'], {
      write: (l) => out.push(l),
      configPath: file,
    })
    expect(code).toBe(0)
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.telemetry.enabled).toBe(true)
    expect(saved.model.model).toBe('claude-sonnet-4-6')
    expect(out.join('\n')).toContain('telemetry enabled')
    rmSync(dir, { recursive: true, force: true })
  })

  it('disables telemetry again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-telemetry-global-'))
    const file = join(dir, 'settings.json')
    writeFileSync(file, JSON.stringify({ telemetry: { enabled: true } }))
    const code = await runTelemetryCommand(['telemetry', 'off'], {
      write: () => {},
      configPath: file,
    })
    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(file, 'utf8')).telemetry.enabled).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses to clobber a broken config file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-telemetry-global-'))
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{ broken')
    const errors: string[] = []
    const code = await runTelemetryCommand(['telemetry', 'on'], {
      write: () => {},
      errorWrite: (l) => errors.push(l),
      configPath: file,
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('invalid JSON')
    expect(readFileSync(file, 'utf8')).toBe('{ broken')
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects unknown subcommands', async () => {
    const errors: string[] = []
    const code = await runTelemetryCommand(['telemetry', 'maybe'], {
      write: () => {},
      errorWrite: (l) => errors.push(l),
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('telemetry')
  })

  it('is reachable through the CLI dispatcher', async () => {
    const out: string[] = []
    const code = await run(['telemetry', 'status'], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('telemetry:')
  })
})
