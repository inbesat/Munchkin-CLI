import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitAll, git } from './worktree'
import { createWorktree, mergeWorktreeChanges, removeWorktree } from './worktree'
import { spawnSubagentInWorktree } from './worktree'

let repo: string
let worktrees: string

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'forge-wt-repo-'))
  worktrees = mkdtempSync(join(tmpdir(), 'forge-wt-host-'))
  git(repo, ['init', '--initial-branch=main'])
  git(repo, ['config', 'user.email', 'forge@test'])
  git(repo, ['config', 'user.name', 'forge'])
  writeFileSync(join(repo, 'README.md'), 'base\n', 'utf-8')
  commitAll(repo, 'initial')
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(worktrees, { recursive: true, force: true })
})

describe('worktree primitives (Phase 96)', () => {
  it('creates a worktree on a new branch', () => {
    const dir = createWorktree({ repoPath: repo, name: 'iso-1', baseDir: worktrees })
    expect(existsSync(dir)).toBe(true)
    expect(existsSync(join(dir, 'README.md'))).toBe(true)
    const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    expect(branch).toBe('forge/subagent/iso-1')
  })

  it('isolates changes: main repo does not see subagent work', () => {
    const dir = createWorktree({ repoPath: repo, name: 'iso-2', baseDir: worktrees })
    writeFileSync(join(dir, 'isolated.txt'), 'child work\n', 'utf-8')
    commitAll(dir, 'subagent change')
    expect(existsSync(join(repo, 'isolated.txt'))).toBe(false)
  })

  it('merges committed subagent changes back into the main repo', () => {
    const dir = createWorktree({ repoPath: repo, name: 'iso-3', baseDir: worktrees })
    writeFileSync(join(dir, 'merged.txt'), 'merged content\n', 'utf-8')
    commitAll(dir, 'add merged.txt')
    const merge = mergeWorktreeChanges({ repoPath: repo, worktreePath: dir })
    expect(merge.ok).toBe(true)
    expect(readFileSync(join(repo, 'merged.txt'), 'utf-8')).toContain('merged content')
  })

  it('reports a merge conflict instead of throwing', () => {
    const dir = createWorktree({ repoPath: repo, name: 'iso-4', baseDir: worktrees })
    // Both sides modify README.md -> guaranteed conflict on merge.
    writeFileSync(join(dir, 'README.md'), 'child version\n', 'utf-8')
    commitAll(dir, 'child edits readme')
    writeFileSync(join(repo, 'README.md'), 'parent version\n', 'utf-8')
    commitAll(repo, 'parent edits readme')
    const merge = mergeWorktreeChanges({ repoPath: repo, worktreePath: dir })
    expect(merge.ok).toBe(false)
    expect(merge.conflict).toBe(true)
  })

  it('removes a worktree (and its branch when discarded)', () => {
    const dir = createWorktree({ repoPath: repo, name: 'iso-5', baseDir: worktrees })
    const removed = removeWorktree({ repoPath: repo, worktreePath: dir, deleteBranch: true })
    expect(removed.ok).toBe(true)
    expect(existsSync(dir)).toBe(false)
  })
})

describe('spawnSubagentInWorktree (Phase 96)', () => {
  it('spawns the subagent whose tool calls can target the worktree cwd', async () => {
    const seen: string[] = []
    const model = async function* () {}
    const scripted = {
      id: 'test/model',
      provider: 'test',
      config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
      async *stream() {
        seen.push('called')
        yield { type: 'text-delta' as const, delta: 'done' }
        yield { type: 'finish' as const, reason: 'stop' as const }
      },
    }
    void model
    const run = await spawnSubagentInWorktree({
      repoPath: repo,
      name: 'spawn-1',
      baseDir: worktrees,
      spawn: {
        model: scripted,
        task: 'work in the worktree',
        systemPrompt: 'subagent.',
      },
    })
    expect(run.run.stopReason).toBe('complete')
    expect(run.run.summary).toBe('done')
    expect(run.worktreePath).toContain('spawn-1')
    expect(seen).toEqual(['called'])
  })
})
