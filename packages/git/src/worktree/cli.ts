/**
 * Worktree manager CLI handlers (Phase 135): no-throw building blocks for
 * `forge worktree list/create/merge/remove`. Implemented directly over git
 * (the @forge/git package stays dependency-free); the forge CLI dispatches
 * these from packages/server/src/cli.ts.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export type WorktreeRun = { ok: boolean; output: string }

function git(cwd: string, args: readonly string[]): { ok: boolean; output: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 60_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output }
}

/** Parsed `git worktree list --porcelain` entry. */
export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  bare: boolean
}

/** Structured `git worktree list --porcelain`. */
export function worktreeList(repoPath: string): {
  ok: boolean
  worktrees: WorktreeEntry[]
  output: string
} {
  const result = git(repoPath, ['worktree', 'list', '--porcelain'])
  if (!result.ok) return { ok: false, worktrees: [], output: result.output }
  const worktrees: WorktreeEntry[] = []
  let current: Partial<WorktreeEntry> = {}
  for (const line of result.output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), bare: false }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length)
    } else if (line === 'bare') {
      current.bare = true
    } else if (line.length === 0 && current.path !== undefined) {
      worktrees.push({
        path: current.path,
        head: current.head ?? '',
        branch: current.branch ?? null,
        bare: current.bare ?? false,
      })
      current = {}
    }
  }
  if (current.path !== undefined) {
    worktrees.push({
      path: current.path,
      head: current.head ?? '',
      branch: current.branch ?? null,
      bare: current.bare ?? false,
    })
  }
  return { ok: true, worktrees, output: result.output }
}

/** `git worktree add <path> -b <branch>` - path defaults to `<repo>/.forge/worktrees/<name>`. */
export function worktreeCreate(
  repoPath: string,
  branch: string,
  options: { path?: string; baseRef?: string } = {},
): WorktreeRun {
  const path = options.path ?? join(repoPath, '.forge', 'worktrees', sanitize(branch))
  const args = ['worktree', 'add', path, '-b', branch]
  if (options.baseRef !== undefined) args.push(options.baseRef)
  const result = git(repoPath, args)
  return result.ok
    ? { ok: true, output: `worktree created at ${path} (branch ${branch})` }
    : { ok: false, output: result.output }
}

/** `git worktree merge <branch>` equivalent: merge the branch into the current checked-out branch. */
export function worktreeMerge(
  repoPath: string,
  branch: string,
  options: { message?: string } = {},
): WorktreeRun {
  const result = git(repoPath, [
    'merge',
    branch,
    ...(options.message !== undefined ? ['-m', options.message] : []),
  ])
  return result.ok
    ? { ok: true, output: `merged ${branch} into the current branch` }
    : { ok: false, output: result.output }
}

/** `git worktree remove` (+ optional branch deletion), with an optional merge first. */
export function worktreeRemove(
  repoPath: string,
  branchOrPath: string,
  options: { deleteBranch?: boolean; force?: boolean } = {},
): WorktreeRun {
  const list = worktreeList(repoPath)
  if (!list.ok) return { ok: false, output: list.output }
  const normalized = branchOrPath.toLowerCase()
  const entry = list.worktrees.find(
    (worktree) =>
      worktree.path.toLowerCase() === normalized ||
      (worktree.branch ?? '').toLowerCase().endsWith(`/${branchOrPath}`) ||
      (worktree.branch ?? '').toLowerCase() === branchOrPath.toLowerCase(),
  )
  if (entry === undefined) {
    return { ok: false, output: `worktree not found: ${branchOrPath}` }
  }
  const removed = git(repoPath, [
    'worktree',
    'remove',
    entry.path,
    ...(options.force === true ? ['--force'] : []),
  ])
  if (!removed.ok) return removed
  let branchNote = ''
  if (options.deleteBranch === true && entry.branch !== null) {
    const short = entry.branch.replace(/^refs\/heads\//, '')
    const deleted = git(repoPath, ['branch', '-d', short])
    branchNote = deleted.ok
      ? ` (branch ${short} deleted)`
      : ` (branch ${short} kept - not fully merged: ${deleted.output})`
  }
  return { ok: true, output: `worktree ${entry.path} removed${branchNote}` }
}

function sanitize(branch: string): string {
  return branch.replaceAll('/', '-')
}
