import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, runAuthCommand } from '../src/cli'

let baseDir: string

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'forge-cli-'))
})

afterEach(() => {
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('CLI - forge auth subcommand (Phase 81)', () => {
  it('prints help on `forge auth help`', async () => {
    const out: string[] = []
    const code = await run(['auth', 'help'], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out.join('')).toMatch(/forge auth/)
  })

  it('create → list → revoke works end-to-end', async () => {
    const out1: string[] = []
    const code1 = await run(['auth', 'create', '--name', 'ci-deploy', '--env', 'ci', '--base-dir', baseDir], {
      write: (l) => out1.push(l),
    })
    expect(code1).toBe(0)
    const created = out1.join('')
    expect(created).toMatch(/secret/)
    const secret = created.match(/frg_[a-zA-Z0-9_-]+/)?.[0]
    expect(secret).toBeDefined()
    expect(created).toMatch(/ci-deploy/)

    const out2: string[] = []
    const code2 = await run(['auth', 'list', '--base-dir', baseDir], { write: (l) => out2.push(l) })
    expect(code2).toBe(0)
    expect(out2.join('')).toMatch(/ci-deploy/)
    expect(out2.join('')).toMatch(/ci/)

    const keysFile = join(baseDir, 'auth', 'keys.json')
    const { readFileSync } = await import('node:fs')
    const stored = readFileSync(keysFile, 'utf-8')
    expect(stored).not.toContain(secret!) // secret never persisted

    const out3: string[] = []
    const code3 = await run(['auth', 'list', '--base-dir', baseDir], { write: (l) => out3.push(l) })
    expect(code3).toBe(0)
    const idLine = out3.find((l) => /^[a-f0-9]{16}/.test(l))
    const id = idLine ? idLine.match(/^[a-f0-9]{16}/)?.[0] : undefined
    expect(id).toBeDefined()

    const out4: string[] = []
    const code4 = await run(['auth', 'revoke', id!, '--base-dir', baseDir], { write: (l) => out4.push(l) })
    expect(code4).toBe(0)
    expect(out4.join('')).toMatch(/revoked/)

    const out5: string[] = []
    const code5 = await run(['auth', 'list', '--base-dir', baseDir], { write: (l) => out5.push(l) })
    expect(code5).toBe(0)
    expect(out5.join('')).toMatch(/No API keys configured/)
  })

  it('create rejects missing --name', async () => {
    const out: string[] = []
    const code = await run(['auth', 'create', '--base-dir', baseDir], { write: (l) => out.push(l) })
    expect(code).toBe(1)
    expect(out.join('')).toMatch(/--name is required/)
  })

  it('revoke of unknown id returns 1 and an error', async () => {
    const out: string[] = []
    const code = await run(['auth', 'revoke', 'no-such-id', '--base-dir', baseDir], { write: (l) => out.push(l) })
    expect(code).toBe(1)
    expect(out.join('')).toMatch(/no such key/)
  })

  it('create with rate "30:5" sets the token bucket fields', async () => {
    const out: string[] = []
    const code = await run(
      ['auth', 'create', '--name', 'r', '--rate', '30:5', '--base-dir', baseDir],
      { write: (l) => out.push(l) },
    )
    expect(code).toBe(0)
    expect(out.join('')).toMatch(/30 burst \/ 5\/s refill/)
  })

  it('create rejects a malformed --rate', async () => {
    const out: string[] = []
    const code = await run(
      ['auth', 'create', '--name', 'bad', '--rate', 'oops', '--base-dir', baseDir],
      { write: (l) => out.push(l) },
    )
    expect(code).toBe(1)
    expect(out.join('')).toMatch(/--rate expects/)
  })

  it('the `auth` subcommand is reachable from the top-level CLI dispatcher', async () => {
    const out: string[] = []
    const code = await run(['auth', 'list', '--base-dir', baseDir], { write: (l) => out.push(l) })
    expect(code).toBe(0)
  })
})

describe('runAuthCommand (direct)', () => {
  it('returns 1 for unknown subcommand', async () => {
    const out: string[] = []
    const code = await runAuthCommand(['auth', 'frobnicate'], { write: (l) => out.push(l) })
    expect(code).toBe(1)
    expect(out.join('')).toMatch(/unknown auth subcommand/)
  })
})
