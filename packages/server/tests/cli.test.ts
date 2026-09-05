import { describe, expect, it } from 'bun:test'
import { parseArgs, run } from '../src/cli'

describe('parseArgs', () => {
  it('defaults to help when argv is empty', () => {
    const r = parseArgs([])
    expect(r.command).toBe('help')
    expect(r.options).toEqual({})
  })

  it('parses the serve subcommand with defaults', () => {
    const r = parseArgs(['serve'])
    expect(r.command).toBe('serve')
    expect(r.options).toEqual({})
  })

  it('parses --port, --host, --base-dir, --db', () => {
    const r = parseArgs([
      'serve',
      '--port',
      '8080',
      '--host',
      '0.0.0.0',
      '--base-dir',
      '/tmp/forge',
      '--db',
      '/tmp/forge/x.db',
    ])
    expect(r.errors).toEqual([])
    expect(r.options).toEqual({
      port: 8080,
      host: '0.0.0.0',
      baseDir: '/tmp/forge',
      dbPath: '/tmp/forge/x.db',
    })
  })

  it('accepts --flag=value form', () => {
    const r = parseArgs(['serve', '--port=9000', '--host=10.0.0.1'])
    expect(r.options.port).toBe(9000)
    expect(r.options.host).toBe('10.0.0.1')
    expect(r.errors).toEqual([])
  })

  it('collects multiple --cors origins into an array', () => {
    const r = parseArgs([
      'serve',
      '--cors',
      'https://app.example.com',
      '--cors',
      'https://admin.example.com',
    ])
    expect(r.options.corsOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ])
  })

  it('--no-cors sets corsOrigins to [] (disables CORS)', () => {
    const r = parseArgs(['serve', '--no-cors'])
    expect(r.options.corsOrigins).toEqual([])
  })

  it('--no-cors wins over a previously declared --cors (order-respecting)', () => {
    const r = parseArgs(['serve', '--cors', 'https://a', '--no-cors'])
    expect(r.options.corsOrigins).toEqual([])
  })

  it('parses --auth-token into the server options', () => {
    const r = parseArgs(['serve', '--auth-token', 'secret-123'])
    expect(r.options.authToken).toBe('secret-123')
  })

  it('rejects an invalid --port value', () => {
    const r = parseArgs(['serve', '--port', 'not-a-number'])
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]).toMatch(/Invalid --port/)
  })

  it('rejects an out-of-range --port value', () => {
    const r = parseArgs(['serve', '--port', '70000'])
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('rejects --port with a missing value', () => {
    const r = parseArgs(['serve', '--port'])
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0]).toMatch(/Missing value for --port/)
  })

  it('treats --port with a following --flag as missing', () => {
    const r = parseArgs(['serve', '--port', '--host', '0.0.0.0'])
    expect(r.errors[0]).toMatch(/Missing value for --port/)
  })

  it('rejects unknown flags', () => {
    const r = parseArgs(['serve', '--unknown'])
    expect(r.errors[0]).toMatch(/Unknown flag: --unknown/)
  })

  it('returns version command for --version / -v', () => {
    expect(parseArgs(['--version']).command).toBe('version')
    expect(parseArgs(['-v']).command).toBe('version')
    expect(parseArgs(['version']).command).toBe('version')
  })

  it('returns help command for --help / -h / help', () => {
    expect(parseArgs(['--help']).command).toBe('help')
    expect(parseArgs(['-h']).command).toBe('help')
    expect(parseArgs(['help']).command).toBe('help')
  })

  it('reports an unknown subcommand', () => {
    const r = parseArgs(['blow-up'])
    expect(r.errors[0]).toMatch(/Unknown subcommand: blow-up/)
    expect(r.command).toBe('help')
  })

  it('infers serve when the first token is a flag (no subcommand prefix)', () => {
    const r = parseArgs(['--port', '4000'])
    expect(r.command).toBe('serve')
    expect(r.options.port).toBe(4000)
  })

  it('parses the rpc subcommand with the same shared flags', () => {
    const r = parseArgs(['rpc', '--base-dir', '/tmp/forge'])
    expect(r.command).toBe('rpc')
    expect(r.options.baseDir).toBe('/tmp/forge')
    expect(r.errors).toEqual([])
  })
})

describe('run', () => {
  it('prints help and exits 0', async () => {
    const out: string[] = []
    const code = await run(['help'], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out.join('')).toMatch(/Usage:/)
  })

  it('prints version and exits 0', async () => {
    const out: string[] = []
    const code = await run(['version'], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out[0]).toMatch(/^forge \d/)
  })

  it('returns 1 with help on a parse error', async () => {
    const out: string[] = []
    const code = await run(['serve', '--port', 'oops'], { write: (l) => out.push(l) })
    expect(code).toBe(1)
    expect(out.some((l) => l.startsWith('error:'))).toBe(true)
    expect(out.some((l) => l.includes('Usage:'))).toBe(true)
  })
})