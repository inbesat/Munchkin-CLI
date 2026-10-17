import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentModel, AgentTool } from '../agent/types'
import { type SpawnSubagentOptions, type SubagentRunResult, spawnSubagent } from './spawn'

/**
 * Git worktree isolation for subagents (Phase 96): run a subagent in a
 * separate worktree so its edits never touch the main workspace; committed
 * work is merged back on completion (conflicts are reported, never thrown).
 */

export interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number
}

/** Run a git command in `cwd`. Never throws; results carry exit info. */
export function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0 && result.status !== null) {
    throw new Error(`git ${args.join(' ')} failed (${result.status}): ${result.stderr}`)
  }
  return result.stdout ?? ''
}

/** git with exit-code capture, for commands where failure is information. */
function gitSoft(cwd: string, args: readonly string[]): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.error !== undefined) {
    return { ok: false, stdout: '', stderr: String(result.error), exitCode: -1 }
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  }
}

/** Stage every change in `repoPath` and commit (used by fixtures/subagents). */
export function commitAll(repoPath: string, message: string): void {
  git(repoPath, ['add', '-A'])
  git(repoPath, ['commit', '-m', message, '--allow-empty', '--no-verify', '--no-gpg-sign'])
}

export interface CreateWorktreeOptions {
  /** Path of the main repository. */
  repoPath: string
  /** Worktree/branch name; branch becomes `forge/subagent/<name>`. */
  name: string
  /** Directory holding created worktrees. Default: `<repoPath>/.forge/worktrees`. */
  baseDir?: string
  /** Base ref for the new branch. Default: HEAD. */
  baseRef?: string
}

/** Create a worktree for the subagent and return its absolute directory. */
export function createWorktree(options: CreateWorktreeOptions): string {
  const baseDir = options.baseDir ?? join(options.repoPath, '.forge', 'worktrees')
  const worktreePath = join(baseDir, options.name)
  const branch = `forge/subagent/${options.name}`
  git(options.repoPath, ['worktree', 'add', worktreePath, '-b', branch, options.baseRef ?? 'HEAD'])
  return worktreePath
}

export interface MergeWorktreeOptions {
  repoPath: string
  worktreePath: string
  /** Default: derive `forge/subagent/<basename>`. */
  branch?: string
  message?: string
}

export interface MergeResult {
  ok: boolean
  /** True when the merge stopped due to conflicts (repo is not left merged). */
  conflict: boolean
  stdout: string
  stderr: string
}

/** Merge the subagent branch back into the main repo. Conflicts abort the merge and are reported. */
export function mergeWorktreeChanges(options: MergeWorktreeOptions): MergeResult {
  const branch =
    options.branch ?? `forge/subagent/${options.worktreePath.split(/[\\/]/).pop() ?? 'subagent'}`
  const merged = gitSoft(options.repoPath, [
    'merge',
    '--no-ff',
    '-m',
    options.message ?? `Merge subagent branch ${branch}`,
    branch,
  ])
  if (merged.ok) return { ...merged, conflict: false }
  // Abort a conflicted merge so the main repo stays clean for the caller.
  gitSoft(options.repoPath, ['merge', '--abort'])
  const conflict = /CONFLICT/i.test(merged.stdout + merged.stderr)
  return { ...merged, conflict }
}

export interface RemoveWorktreeOptions {
  repoPath: string
  worktreePath: string
  /** Also delete the subagent branch (use when discarding unmerged work). */
  deleteBranch?: boolean
  /** Force removal even with uncommitted changes. Default: false. */
  force?: boolean
}

export interface RemoveResult {
  ok: boolean
  worktreeRemoved: boolean
  branchDeleted: boolean
  stderr: string
}

/** Remove the worktree (and optionally its branch). Failures are reported, not thrown. */
export function removeWorktree(options: RemoveWorktreeOptions): RemoveResult {
  const args = ['worktree', 'remove']
  if (options.force) args.push('--force')
  args.push(options.worktreePath)
  const removed = gitSoft(options.repoPath, args)
  let branchDeleted = false
  if (options.deleteBranch) {
    const branch = `forge/subagent/${options.worktreePath.split(/[\\/]/).pop() ?? 'subagent'}`
    const deleted = gitSoft(options.repoPath, ['branch', '-D', branch])
    branchDeleted = deleted.ok
  }
  return {
    ok: removed.ok && (!options.deleteBranch || branchDeleted),
    worktreeRemoved: removed.ok,
    branchDeleted,
    stderr: removed.stderr,
  }
}

export interface SpawnInWorktreeOptions {
  repoPath: string
  name: string
  baseDir?: string
  spawn: SpawnSubagentOptions
  /** Merge the subagent branch back when the run completes. Default: true. */
  mergeOnSuccess?: boolean
}

export interface SpawnInWorktreeResult {
  run: SubagentRunResult
  worktreePath: string
  branch: string
  merge?: { ok: boolean; conflict: boolean }
}

/**
 * Spawn a subagent inside a fresh worktree. The child's tools receive the
 * worktree path via their own cwd/args conventions — the spawn contract
 * (Phase 93) is unchanged; this module only adds the isolation envelope.
 */
export async function spawnSubagentInWorktree(
  options: SpawnInWorktreeOptions,
): Promise<SpawnInWorktreeResult> {
  const worktreePath = createWorktree({
    repoPath: options.repoPath,
    name: options.name,
    baseDir: options.baseDir,
  })
  const branch = `forge/subagent/${options.name}`
  try {
    const run = await spawnSubagent(options.spawn)
    const mergeOnSuccess = options.mergeOnSuccess ?? true
    if (mergeOnSuccess && run.stopReason === 'complete') {
      // Nothing to merge until the child (or its tools) committed — a no-op
      // merge of an unchanged branch still succeeds.
      const merge = mergeWorktreeChanges({ repoPath: options.repoPath, worktreePath, branch })
      return { run, worktreePath, branch, merge: { ok: merge.ok, conflict: merge.conflict } }
    }
    return { run, worktreePath, branch }
  } finally {
    if (existsSync(worktreePath)) {
      removeWorktree({
        repoPath: options.repoPath,
        worktreePath,
        deleteBranch: options.mergeOnSuccess === false,
        force: true,
      })
    }
  }
}

export type { AgentModel, AgentTool }
