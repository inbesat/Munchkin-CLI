/**
 * `forge` — top-level CLI. Subcommands:
 *   - `serve [--port <n>] [--host <h>] [--base-dir <d>] [--db <path>]
 *           [--cors <origin>] [--no-cors]`
 *
 * The CLI is intentionally thin: it parses argv, constructs a {@link
 * ServerOptions} object, and delegates to {@link createServer}. The server
 * already owns the lifecycle (port binding, signal handlers) so this layer
 * stays a pure argument adapter that's easy to test.
 */

import { VERSION } from '@forge/core'
import { worktreeCreate, worktreeList, worktreeMerge, worktreeRemove } from '@forge/git'
import { join } from 'node:path'
import { AuthStore } from './auth/store'
import { createServer, type ServerOptions } from './server'

export type Subcommand = 'serve' | 'rpc' | 'auth' | 'worktree' | 'help' | 'version'

export interface ParsedArgs {
  command: Subcommand
  options: ServerOptions
  /** Original argv tail (after subcommand) for debugging. */
  raw: string[]
  /** Free-form key/value list (`--flag value`) — exposed for testing. */
  flags: Record<string, string | boolean>
  /** Errors encountered during parsing (non-empty → process should exit). */
  errors: string[]
}

export interface ParseOptions {
  /** Override stdout for `help`/`version` (used in tests). */
  write?: (line: string) => void
}

const HELP = `forge ${VERSION}

Usage:
  forge serve [options]
  forge rpc [options]
  forge auth <list|create|revoke> [options]
  forge worktree <list|create|merge|remove> [options]
  forge help
  forge version

Options:
  --port <n>            TCP port to listen on (default 3000; serve only)
  --host <h>            Interface to bind (default 127.0.0.1; serve only)
  --base-dir <path>     State directory (default \$CWD/.forge)
  --db <path>           SQLite path (default <base-dir>/forge.db)
  --cors <origin>       Allow a specific CORS origin (repeatable)
  --no-cors             Disable CORS (default allows '*')
  --auth-token <t>      Require a bearer token on every request (serve only)
  --help, -h            Show this help
  --version, -v         Show the version

Examples:
  forge serve --port 3845
  forge serve --host 0.0.0.0 --port 8080 --cors https://app.example.com
  forge serve --auth-token $(openssl rand -hex 32)
  forge rpc                          # JSON-RPC over stdio (for editor/Python)
  forge rpc --base-dir /tmp/forge    # custom state dir
  forge auth create --name 'ci-deploy' --env ci
  forge auth list
  forge auth revoke <key-id>
`

/**
 * Parse a raw argv tail into a {@link ParsedArgs}. No I/O — pure function so
 * tests can cover every code path.
 */
export function parseArgs(argv: string[], _opts: ParseOptions = {}): ParsedArgs {
  const errors: string[] = []
  const flags: Record<string, string | boolean> = {}
  const corsOrigins: string[] = []
  let command: Subcommand = 'help'
  let port: number | undefined
  let host: string | undefined
  let baseDir: string | undefined
  let dbPath: string | undefined
  let noCors = false
  let authToken: string | undefined

  const takeValue = (flag: string, i: number): { value: string; next: number } | string => {
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      return `Missing value for ${flag}`
    }
    return { value: next, next: i + 2 }
  }

  let i = 0
  if (argv.length > 0) {
    const first = argv[0]
    if (first === 'serve') {
      command = 'serve'
      i = 1
    } else if (first === 'rpc') {
      command = 'rpc'
      i = 1
    } else if (first === 'auth') {
      command = 'auth'
      i = 1
    } else if (first === 'help' || first === '-h' || first === '--help') {
      return { command: 'help', options: {}, raw: argv, flags, errors }
    } else if (first === 'version' || first === '-v' || first === '--version') {
      return { command: 'version', options: {}, raw: argv, flags, errors }
    } else if (first?.startsWith('--')) {
      command = 'serve'
    } else if (first) {
      errors.push(`Unknown subcommand: ${first}`)
      return { command: 'help', options: {}, raw: argv, flags, errors }
    }
  }

  for (; i < argv.length; i++) {
    const arg = argv[i] as string
    const eq = arg.indexOf('=')
    const flag = eq >= 0 ? arg.slice(0, eq) : arg
    const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined

    const value = (next: number): { v: string; n: number } | string => {
      if (inlineValue !== undefined) return { v: inlineValue, n: next + 1 }
      const r = takeValue(flag, next)
      if (typeof r === 'string') return r
      return { v: r.value, n: r.next }
    }

    switch (flag) {
      case '--port': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        const n = Number.parseInt(r.v, 10)
        if (!Number.isFinite(n) || n < 1 || n > 65535) {
          errors.push(`Invalid --port value: ${r.v}`)
        } else {
          port = n
          flags.port = r.v
        }
        i = r.n - 1
        break
      }
      case '--host': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        host = r.v
        flags.host = r.v
        i = r.n - 1
        break
      }
      case '--base-dir': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        baseDir = r.v
        flags['base-dir'] = r.v
        i = r.n - 1
        break
      }
      case '--db': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        dbPath = r.v
        flags.db = r.v
        i = r.n - 1
        break
      }
      case '--cors': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        corsOrigins.push(r.v)
        flags.cors = r.v
        i = r.n - 1
        break
      }
      case '--no-cors': {
        noCors = true
        flags['no-cors'] = true
        break
      }
      case '--auth-token': {
        const r = value(i)
        if (typeof r === 'string') {
          errors.push(r)
          break
        }
        authToken = r.v
        flags['auth-token'] = r.v
        i = r.n - 1
        break
      }
      case '-h':
      case '--help': {
        return { command: 'help', options: {}, raw: argv, flags, errors }
      }
      case '-v':
      case '--version': {
        return { command: 'version', options: {}, raw: argv, flags, errors }
      }
      default:
        errors.push(`Unknown flag: ${flag}`)
        break
    }
  }

  const options: ServerOptions = {}
  if (port !== undefined) options.port = port
  if (host !== undefined) options.host = host
  if (baseDir !== undefined) options.baseDir = baseDir
  if (dbPath !== undefined) options.dbPath = dbPath
  if (noCors) {
    options.corsOrigins = []
  } else if (corsOrigins.length > 0) {
    options.corsOrigins = corsOrigins
  }
  if (authToken !== undefined) options.authToken = authToken

  return { command, options, raw: argv, flags, errors }
}

/** Run the CLI; returns the exit code (0 success, 1 error). */
export async function run(argv: string[], opts: ParseOptions = {}): Promise<number> {
  const write = opts.write ?? ((line) => process.stdout.write(`${line}\n`))
  // The auth subcommand has its own flag set; intercept before parseArgs
  // sees the server flags.
  if (argv[0] === 'auth') {
    return runAuthCommand(argv, { write })
  }
  // Phase 135: `forge worktree list|create|merge|remove` - handled by @forge/git.
  if (argv[0] === 'worktree') {
    return runWorktreeCommand(argv.slice(1), { write })
  }
  const parsed = parseArgs(argv, opts)

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) write(`error: ${err}`)
    write('')
    write(HELP)
    return 1
  }

  if (parsed.command === 'help') {
    write(HELP)
    return 0
  }
  if (parsed.command === 'version') {
    write(`forge ${VERSION}`)
    return 0
  }

  if (parsed.command === 'rpc') {
    // Lazy import so the HTTP path doesn't pull readline/JSON-RPC into the bundle.
    const { RpcServer } = await import('./rpc/server')
    const { registerRpcMethods } = await import('./rpc/bindings')
    const server = await createServer(parsed.options)
    const rpc = new RpcServer({ input: process.stdin, output: process.stdout })
    registerRpcMethods(rpc, {
      sessionManager: server.getSessionManager(),
      agentExecutor: server.getAgentExecutor(),
    })
    process.stderr.write(`forge ${VERSION} rpc ready (stdin/stdout)\n`)
    await rpc.serve()
    server.close()
    return 0
  }


  if (parsed.command === 'auth') {
    return runAuthCommand(argv, { write: opts.write ?? ((l) => process.stdout.write(`${l}\n`)) })
  }

  // `serve`
  const server = await createServer(parsed.options)
  const port = parsed.options.port ?? 3000
  const host = parsed.options.host ?? '127.0.0.1'
  write(`forge ${VERSION} listening on http://${host}:${port}`)
  write(`  base-dir: ${parsed.options.baseDir ?? '<cwd>/.forge'}`)
  if (parsed.options.authToken) write('  auth: bearer token required')
  if (parsed.options.corsOrigins !== undefined) {
    write(`  cors: ${parsed.options.corsOrigins.length === 0 ? 'disabled' : parsed.options.corsOrigins.join(', ')}`)
  }
  write('Press Ctrl+C to stop.')

  // The server install its own SIGINT/SIGTERM handlers and never resolves
  // `start()`; we await a never-resolving promise so this CLI process stays
  // alive until the signal handler calls process.exit.
  await server.start()
  return 0
}

/**
 * `forge auth <subcommand>`. The auth CLI talks to the on-disk AuthStore
 * directly (no server needed). Subcommands:
 *   list                          - show every key (id, name, env, scopes, ...)
 *   create --name <n> [--env ...] - mint a new key, print the secret once
 *   revoke <key-id>               - delete a key
 */
export async function runAuthCommand(
  rawArgv: string[],
  opts: { write?: (line: string) => void } = {},
): Promise<number> {
  const write = opts.write ?? ((l) => process.stdout.write(`${l}\n`))
  // Drop the "auth" prefix and re-parse.
  const argv = rawArgv[0] === 'auth' ? rawArgv.slice(1) : rawArgv
  const sub = argv[0]
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    write(AUTH_HELP)
    return 0
  }
  const baseDirFlagIdx = argv.indexOf('--base-dir')
  const baseDir = baseDirFlagIdx >= 0 && argv[baseDirFlagIdx + 1]
    ? argv[baseDirFlagIdx + 1]
    : join(process.cwd(), '.forge')
  const authDir = join(baseDir, 'auth')
  const store = new AuthStore({ baseDir: authDir })
  await store.load()

  if (sub === 'list' || sub === 'ls') {
    const keys = await store.listKeys()
    if (keys.length === 0) {
      write('No API keys configured.')
      write(`  Create one with: forge auth create --name <name>`)
      return 0
    }
    write(`${'ID'.padEnd(18)} ${'NAME'.padEnd(24)} ${'ENV'.padEnd(8)} ${'SCOPES'.padEnd(12)} LAST USED`)
    for (const k of keys) {
      const last = k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : 'never'
      write(`${k.id.padEnd(18)} ${k.name.padEnd(24)} ${k.env.padEnd(8)} ${k.scopes.join(',').padEnd(12)} ${last}`)
    }
    return 0
  }

  if (sub === 'create') {
    const opts2 = parseAuthCreateFlags(argv.slice(1))
    if (opts2.error) {
      write(`error: ${opts2.error}`)
      write(AUTH_HELP)
      return 1
    }
    const result = await store.createKey(opts2.options)
    write('Created key:')
    write(`  id:     ${result.metadata.id}`)
    write(`  name:   ${result.metadata.name}`)
    write(`  env:    ${result.metadata.env}`)
    write(`  scopes: ${result.metadata.scopes.join(', ')}`)
    write(`  rate:   ${result.metadata.rateLimit.capacity} burst / ${result.metadata.rateLimit.refillPerSec}/s refill`)
    write('')
    write('  secret (save now - it will NOT be shown again):')
    write(`    ${result.secret}`)
    return 0
  }

  if (sub === 'revoke') {
    const id = argv[1]
    if (!id) {
      write('error: revoke requires a key id')
      return 1
    }
    const ok = await store.revokeKey(id)
    if (!ok) {
      write(`error: no such key: ${id}`)
      return 1
    }
    write(`revoked ${id}`)
    return 0
  }

  write(`error: unknown auth subcommand: ${sub}`)
  write(AUTH_HELP)
  return 1
}

const WORKTREE_HELP = `forge worktree - manage git worktrees

Usage:
  forge worktree list
  forge worktree create <branch> [--path <p>] [--base <ref>]
  forge worktree merge <branch> [--message <m>]
  forge worktree remove <branch-or-path> [--delete-branch] [--force]
  forge worktree help
`

/** Phase 135: dispatch `forge worktree ...` against the @forge/git handlers. */
function runWorktreeCommand(
  argv: string[],
  opts: { write: (line: string) => void },
): number {
  const write = (line: string): void => opts.write(line)
  const sub = argv[0] ?? 'list'
  const repoPath = process.cwd()

  switch (sub) {
    case 'list': {
      const result = worktreeList(repoPath)
      if (!result.ok) {
        write(`error: ${result.output}`)
        return 1
      }
      if (result.worktrees.length === 0) write('(no worktrees)')
      for (const worktree of result.worktrees) {
        const branch = worktree.branch ?? (worktree.bare ? '(bare)' : '(detached)')
        write(`${worktree.path}  [${branch}] ${worktree.head.slice(0, 8)}`)
      }
      return 0
    }
    case 'create': {
      const branch = argv[1]
      if (branch === undefined) {
        write('usage: forge worktree create <branch> [--path <p>] [--base <ref>]')
        return 1
      }
      const flags = argv.slice(2)
      const pathFlag = flags.indexOf('--path')
      const baseFlag = flags.indexOf('--base')
      const result = worktreeCreate(repoPath, branch, {
        path: pathFlag !== -1 ? flags[pathFlag + 1] : undefined,
        baseRef: baseFlag !== -1 ? flags[baseFlag + 1] : undefined,
      })
      write(result.output)
      return result.ok ? 0 : 1
    }
    case 'merge': {
      const branch = argv[1]
      if (branch === undefined) {
        write('usage: forge worktree merge <branch> [--message <m>]')
        return 1
      }
      const messageFlag = argv.indexOf('--message')
      const result = worktreeMerge(repoPath, branch, {
        message: messageFlag !== -1 ? argv[messageFlag + 1] : undefined,
      })
      write(result.output)
      return result.ok ? 0 : 1
    }
    case 'remove': {
      const target = argv[1]
      if (target === undefined) {
        write('usage: forge worktree remove <branch-or-path> [--delete-branch] [--force]')
        return 1
      }
      const result = worktreeRemove(repoPath, target, {
        deleteBranch: argv.includes('--delete-branch'),
        force: argv.includes('--force'),
      })
      write(result.output)
      return result.ok ? 0 : 1
    }
    case 'help':
      write(WORKTREE_HELP)
      return 0
    default:
      write(`error: unknown worktree subcommand: ${sub}`)
      write(WORKTREE_HELP)
      return 1
  }
}

const AUTH_HELP = `forge auth - manage API keys

Usage:
  forge auth list
  forge auth create --name <n> [--env <env>] [--scope <s>]... [--rate <cap>:<rps>]
  forge auth revoke <key-id>
  forge auth help

Options (create):
  --name <n>            Key name (required, e.g. "ci-deploy")
  --env <env>           Environment label (default: live)
  --scope <s>           Scope (repeatable, default: *)
  --rate <cap>:<rps>    Token bucket: capacity per refill (default: 60:10)
  --base-dir <path>     State directory (default: \$CWD/.forge)
`

interface ParsedCreateOptions {
  options: { name: string; env?: string; scopes?: string[]; rateLimit?: { capacity?: number; refillPerSec?: number } }
  error?: string
}

function parseAuthCreateFlags(argv: string[]): ParsedCreateOptions {
  let name: string | undefined
  let env: string | undefined
  const scopes: string[] = []
  let capacity: number | undefined
  let refillPerSec: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') {
      const v = argv[++i]
      if (!v) return { options: { name: '' }, error: '--name requires a value' }
      name = v
    } else if (a === '--env') {
      const v = argv[++i]
      if (!v) return { options: { name: '' }, error: '--env requires a value' }
      env = v
    } else if (a === '--scope') {
      const v = argv[++i]
      if (!v) return { options: { name: '' }, error: '--scope requires a value' }
      scopes.push(v)
    } else if (a === '--rate') {
      const v = argv[++i]
      if (!v) return { options: { name: '' }, error: '--rate requires a value' }
      const [cap, rps] = v.split(':')
      capacity = Number.parseInt(cap ?? '', 10)
      refillPerSec = Number.parseFloat(rps ?? '')
      if (!Number.isFinite(capacity) || capacity! <= 0 || !Number.isFinite(refillPerSec!) || refillPerSec! <= 0) {
        return { options: { name: '' }, error: `--rate expects "capacity:refillPerSec" (got "${v}")` }
      }
    } else if (a === '--base-dir') {
      i++ // skip the value; the dispatch reads it separately
    } else if (a?.startsWith('--')) {
      return { options: { name: '' }, error: `unknown flag: ${a}` }
    }
  }
  if (!name) {
    return { options: { name: '' }, error: '--name is required' }
  }
  const out: ParsedCreateOptions['options'] = { name }
  if (env) out.env = env
  if (scopes.length > 0) out.scopes = scopes
  if (capacity !== undefined || refillPerSec !== undefined) {
    out.rateLimit = {
      ...(capacity !== undefined ? { capacity } : {}),
      ...(refillPerSec !== undefined ? { refillPerSec } : {}),
    }
  }
  return { options: out }
}
