import { afterAll, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { worktreeCreate, worktreeList, worktreeMerge, worktreeRemove } from './cli'

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-worktree-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'base.txt'), 'seed\n', 'utf-8')
  const gitRun = (args: string[]): void => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  gitRun(['init', '--initial-branch=main'])
  gitRun(['config', 'user.email', 't@t'])
  gitRun(['config', 'user.name', 't'])
  gitRun(['add', '-A'])
  gitRun(['commit', '-m', 'seed', '--no-gpg-sign'])
  return dir
}

describe('worktree manager handlers (Phase 135)', () => {
  it('create → list shows the worktree with its branch; remove deletes it', () => {
    const repo = makeRepo()
    const created = worktreeCreate(repo, 'feature/x', { baseRef: 'main' })
    expect(created.ok).toBe(true)

    const list = worktreeList(repo)
    expect(list.ok).toBe(true)
    const entry = list.worktrees.find((w) => w.branch?.endsWith('feature/x'))
    expect(entry).toBeDefined()
    expect(entry?.head).toHaveLength(40)

    const removed = worktreeRemove(repo, 'feature/x', { deleteBranch: true })
    expect(removed.ok).toBe(true)
    const after = worktreeList(repo)
    expect(after.worktrees.find((w) => w.branch?.endsWith('feature/x'))).toBeUndefined()
  })

  it('merge brings committed worktree changes into the main branch', () => {
    const repo = makeRepo()
    const created = worktreeCreate(repo, 'feature/y', { baseRef: 'main' })
    expect(created.ok).toBe(true)

    const list = worktreeList(repo)
    const entry = list.worktrees.find((w) => w.branch?.endsWith('feature/y'))
    expect(entry).toBeDefined()
    if (entry === undefined) return

    // Commit inside the worktree clone.
    writeFileSync(join(entry.path, 'works.txt'), 'merged change\n', 'utf-8')
    const gitRun = (args: string[]): void => {
      const result = spawnSync('git', args, { cwd: entry.path, encoding: 'utf-8' })
      if (result.status !== 0) throw new Error(result.stderr)
    }
    gitRun(['add', '-A'])
    gitRun(['commit', '-m', 'worktree change', '--no-gpg-sign'])

    const merged = worktreeMerge(repo, 'feature/y')
    expect(merged.ok).toBe(true)
    expect(existsInRepo(repo, 'works.txt')).toBe(true)
  })

  it('remove with deleteBranch keeps unmerged branches instead of deleting them', () => {
    const repo = makeRepo()
    const created = worktreeCreate(repo, 'feature/z', { baseRef: 'main' })
    expect(created.ok).toBe(true)
    const list = worktreeList(repo)
    const entry = list.worktrees.find((w) => w.branch?.endsWith('feature/z'))
    expect(entry).toBeDefined()
    if (entry === undefined) return
    writeFileSync(join(entry.path, 'unmerged.txt'), 'x\n', 'utf-8')
    const gitRun = (args: string[]): void => {
      const result = spawnSync('git', args, { cwd: entry.path, encoding: 'utf-8' })
      if (result.status !== 0) throw new Error(result.stderr)
    }
    gitRun(['add', '-A'])
    gitRun(['commit', '-m', 'unmerged', '--no-gpg-sign'])

    const removed = worktreeRemove(repo, 'feature/z', { deleteBranch: true })
    expect(removed.ok).toBe(true)
    expect(removed.output).toContain('branch feature/z kept')
  })

  it('unknown worktrees are reported cleanly', () => {
    const repo = makeRepo()
    const result = worktreeRemove(repo, 'does-not-exist')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('worktree not found')
  })

  it('list fails gracefully outside a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'forge-notrepo-'))
    dirs.push(notARepo)
    const result = worktreeList(notARepo)
    expect(result.ok).toBe(false)
  })
})

function existsInRepo(repo: string, file: string): boolean {
  const result = spawnSync('git', ['show', `HEAD:${file}`], { cwd: repo, encoding: 'utf-8' })
  return result.status === 0
}
