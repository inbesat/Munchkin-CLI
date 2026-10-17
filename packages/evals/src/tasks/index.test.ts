import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_TASKS } from './index'

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'forge-task-'))
}

function cleanup(workspace: string): void {
  try {
    rmSync(workspace, { recursive: true, force: true })
  } catch {
    // best-effort cleanup (Windows can hold handles briefly)
  }
}

function task(id: string) {
  const found = BUILTIN_TASKS.find((t) => t.id === id)
  if (!found) throw new Error(`missing builtin task: ${id}`)
  return found
}

describe('BUILTIN_TASKS (Phase 145)', () => {
  it('exposes unique, well-formed tasks', () => {
    const ids = BUILTIN_TASKS.map((t) => t.id)
    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of BUILTIN_TASKS) {
      expect(t.prompt.trim().length).toBeGreaterThan(0)
      expect(t.description.trim().length).toBeGreaterThan(0)
      expect(typeof t.verify).toBe('function')
    }
  })

  it('create-file verifies exact content', async () => {
    const workspace = tempWorkspace()
    const t = task('create-file')
    expect(await t.verify(workspace)).toBe(false)
    writeFileSync(join(workspace, 'hello.txt'), 'hello forge\n')
    expect(await t.verify(workspace)).toBe(true)
    cleanup(workspace)
  })

  it('fix-off-by-one verifies behavior, not text', async () => {
    const workspace = tempWorkspace()
    const t = task('fix-off-by-one')
    writeFileSync(join(workspace, 'sum.js'), t.files['sum.js'] ?? '')
    expect(await t.verify(workspace)).toBe(false)
    writeFileSync(
      join(workspace, 'sum.js'),
      'export function sum(values) {\n  let total = 0\n  for (const value of values) total += value\n  return total\n}\n',
    )
    expect(await t.verify(workspace)).toBe(true)
    cleanup(workspace)
  })

  it('rename-across-files verifies both files', async () => {
    const workspace = tempWorkspace()
    const t = task('rename-across-files')
    for (const [file, content] of Object.entries(t.files)) {
      writeFileSync(join(workspace, file), content)
    }
    expect(await t.verify(workspace)).toBe(false)
    writeFileSync(
      join(workspace, 'lib.js'),
      "export function greet(name) {\n  return 'hi ' + name\n}\n",
    )
    writeFileSync(
      join(workspace, 'app.js'),
      "import { greet } from './lib.js'\n\nexport function run() {\n  return greet('forge')\n}\n",
    )
    expect(await t.verify(workspace)).toBe(true)
    cleanup(workspace)
  })
})
