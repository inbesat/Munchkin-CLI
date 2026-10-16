/**
 * SmartCommit (Phase 133): stages changes (opt-in) and creates a commit
 * with a generated conventional-commit message derived from the actual
 * working-tree changes. The message generator is pure and unit-testable;
 * the tool wrapper spawns git and never throws.
 */

import { spawnSync } from 'node:child_process'

export interface ChangeFileEntry {
  path: string
  /** git status --porcelain XY code, e.g. 'M ', '??', 'D '. */
  status: string
}

export type GitRunResult = { ok: boolean; output: string }

function run(cwd: string, args: readonly string[]): GitRunResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 60_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: result.status === 0, output: output.length > 0 ? output : '(no output)' }
}

/** Conventional-commit type derived from changed paths and diff content. */
export function classifyChangeType(
  files: readonly ChangeFileEntry[],
  diffSummary: string,
): {
  type: string
  scope: string | null
} {
  const paths = files.map((file) => file.path.toLowerCase())
  if (paths.some((path) => path.includes('test') || path.includes('.spec.')))
    return { type: 'test', scope: null }
  if (
    paths.every((path) => path.endsWith('.md') || path.includes('docs') || path.includes('README'))
  ) {
    return { type: 'docs', scope: null }
  }
  if (paths.length > 0) {
    const segments = paths[0]?.split('/') ?? []
    if (segments.length > 1) {
      const scopeCandidate = segments[segments.length - 2]
      if (scopeCandidate !== undefined && scopeCandidate.length > 0 && scopeCandidate !== '.') {
        return {
          type: diffSummary.includes('breaking') ? 'feat!' : 'feat',
          scope: scopeCandidate,
        }
      }
    }
  }
  return { type: diffSummary.includes('breaking') ? 'feat!' : 'feat', scope: null }
}

/** `type(scope): subject` from the changed files (deterministic). */
export function generateCommitMessage(
  files: readonly ChangeFileEntry[],
  diffSummary = '',
): {
  type: string
  scope: string | null
  subject: string
  message: string
} {
  const { type, scope } = classifyChangeType(files, diffSummary)
  const added = files.filter((f) => f.status.includes('?') || f.status.startsWith('A')).length
  const deleted = files.filter((f) => f.status.startsWith('D')).length
  const modified = files.length - added - deleted
  const parts: string[] = []
  if (added > 0) parts.push(`${added} added`)
  if (modified > 0) parts.push(`${modified} modified`)
  if (deleted > 0) parts.push(`${deleted} deleted`)
  const subject =
    parts.length > 0
      ? `update ${files.length} file(s): ${parts.join(', ')}`
      : `update ${files.length} file(s)`
  const scopePart = scope !== null ? `(${scope})` : ''
  const message = `${type}${scopePart}: ${subject}`
  return { type, scope, subject, message }
}

export interface SmartCommitInput {
  /** Working directory (defaults to process cwd). */
  cwd?: string
  /** Explicit message override; generated when omitted. */
  message?: string
  /** `git add -A` before committing (default true). */
  addAll?: boolean
  /** Build the message but do not commit. */
  dryRun?: boolean
}

export type SmartCommitResult =
  | { ok: true; message: string; committed: boolean; output: string }
  | { ok: false; error: string; message?: string }

/** Read `git status --porcelain` entries for the working tree. */
export function readStatusEntries(
  cwd: string,
): { ok: true; entries: ChangeFileEntry[] } | { ok: false; error: string } {
  const status = run(cwd, ['status', '--porcelain'])
  if (!status.ok) return { ok: false, error: status.output }
  const entries: ChangeFileEntry[] = status.output
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3).trim().replace(/^"|"$/g, '') }))
  return { ok: true, entries }
}

export class SmartCommitTool {
  readonly name = 'smart_commit'
  readonly description =
    'Stage changes and commit with a generated conventional-commit message derived from the working tree.'
  readonly parameters = {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'explicit commit message (skips generation)' },
      addAll: { type: 'boolean', description: 'stage all changes first (default true)' },
      dryRun: { type: 'boolean', description: 'show the generated message without committing' },
      cwd: { type: 'string' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<SmartCommitResult> {
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd()
    const addAll = input.addAll !== false
    const dryRun = input.dryRun === true

    const status = readStatusEntries(cwd)
    if (!status.ok) return { ok: false, error: status.error }
    if (status.entries.length === 0)
      return { ok: false, error: 'working tree clean - nothing to commit' }

    const stat = run(cwd, ['diff', '--stat']).output
    let message =
      typeof input.message === 'string' && input.message.trim().length > 0
        ? input.message.trim()
        : generateCommitMessage(status.entries, stat).message

    if (dryRun)
      return { ok: true, message, committed: false, output: 'dry run - nothing committed' }
    if (
      message.length > 0 &&
      !/^[a-z]+(\([a-z0-9-]+\))?!?: /i.test(message) &&
      !/^(Merge|Revert)/.test(message)
    ) {
      // Prefix an explicit-but-non-conventional message with feat: to keep history uniform.
      message = message.replace(/^title: /i, '')
      message = `feat: ${message.charAt(0).toLowerCase()}${message.slice(1)}`
    }

    if (addAll) {
      const added = run(cwd, ['add', '-A'])
      if (!added.ok) return { ok: false, error: `git add failed: ${added.output}` }
    }
    const commit = run(cwd, ['commit', '-m', message])
    if (!commit.ok) {
      return { ok: false, error: `git commit failed: ${commit.output}`, message }
    }
    return { ok: true, message, committed: true, output: commit.output }
  }
}

export const smartCommitTool = new SmartCommitTool()
