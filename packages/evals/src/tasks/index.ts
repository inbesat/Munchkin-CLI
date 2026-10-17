import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Phase 145: a benchmark task for the eval runner. Tasks are fully offline and
 * deterministic: fixture files go in, a pure checker decides pass/fail.
 */
export interface EvalTask {
  id: string
  /** One-line description for `forge eval list`. */
  description: string
  /** Prompt handed to the agent. */
  prompt: string
  /** Workspace files created before the run (relative path -> content). */
  files: Record<string, string>
  /** Verifies the workspace after the run; true = task passed. */
  verify: (workspace: string) => Promise<boolean> | boolean
}

async function readWorkspaceFile(workspace: string, file: string): Promise<string | null> {
  try {
    return await readFile(join(workspace, file), 'utf8')
  } catch {
    return null
  }
}

/**
 * Built-in tasks in the SWE-bench-lite spirit: a small buggy repo plus a
 * checker that runs the fixed code (or asserts on the resulting files).
 */
export const BUILTIN_TASKS: EvalTask[] = [
  {
    id: 'create-file',
    description: 'Create a file with exact content',
    prompt: 'Create hello.txt containing exactly "hello forge" (a trailing newline is fine).',
    files: {},
    verify: async (workspace) => {
      const content = await readWorkspaceFile(workspace, 'hello.txt')
      return content !== null && content.trim() === 'hello forge'
    },
  },
  {
    id: 'fix-off-by-one',
    description: 'Fix an off-by-one bug so the function sums correctly',
    prompt:
      'sum.js has a bug: sum([1,2,3]) must be 6 but returns more, and sum([]) must be 0. Fix the bug without changing the function signature.',
    files: {
      'sum.js':
        'export function sum(values) {\n  let total = 1\n  for (const value of values) total += value\n  return total\n}\n',
    },
    verify: async (workspace) => {
      const source = await readWorkspaceFile(workspace, 'sum.js')
      if (source === null) return false
      // Import a uniquely-named copy: bun caches file:// modules by path, so
      // re-checking the same file after a fix would otherwise run stale code.
      const copy = join(workspace, `.verify-sum-${randomUUID()}.mjs`)
      try {
        await writeFile(copy, source)
        const module = (await import(pathToFileURL(copy).href)) as {
          sum?: (values: number[]) => number
        }
        return (
          typeof module.sum === 'function' && module.sum([1, 2, 3]) === 6 && module.sum([]) === 0
        )
      } catch {
        return false
      } finally {
        await rm(copy, { force: true }).catch(() => {})
      }
    },
  },
  {
    id: 'rename-across-files',
    description: 'Rename an exported function and update its call site',
    prompt:
      'Rename the exported function greetOld to greet in lib.js and update its use in app.js. Keep behavior identical.',
    files: {
      'lib.js': "export function greetOld(name) {\n  return 'hi ' + name\n}\n",
      'app.js':
        "import { greetOld } from './lib.js'\n\nexport function run() {\n  return greetOld('forge')\n}\n",
    },
    verify: async (workspace) => {
      const lib = await readWorkspaceFile(workspace, 'lib.js')
      const app = await readWorkspaceFile(workspace, 'app.js')
      if (lib === null || app === null) return false
      return (
        /export\s+function\s+greet\s*\(/.test(lib) &&
        !lib.includes('greetOld') &&
        app.includes('greet(') &&
        !app.includes('greetOld')
      )
    },
  },
]
