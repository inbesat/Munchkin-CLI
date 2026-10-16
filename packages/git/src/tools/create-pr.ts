/**
 * CreatePR (Phase 133): pushes the current branch and opens a PR with a
 * description assembled from conversation context + recent commits via the
 * `gh` CLI. The pure builders (title/body/argv) are unit-testable without
 * gh; execution requires gh + auth and degrades to result objects.
 */

import { spawnSync } from 'node:child_process'

export interface PrContext {
  /** Conversation context summary (what the user asked / what changed). */
  contextSummary?: string
  /** Recent commit subjects to include in the description. */
  commits?: readonly string[]
}

export type GitRunResult = { ok: boolean; output: string }

function run(cwd: string, args: readonly string[], timeoutMs = 60_000): GitRunResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: timeoutMs })
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }
}

/** PR body: conversation context + commit list (deterministic sections). */
export function buildPrBody(context: PrContext): string {
  const sections: string[] = []
  if (context.contextSummary !== undefined && context.contextSummary.trim().length > 0) {
    sections.push(`## Context\n\n${context.contextSummary.trim()}`)
  }
  if (context.commits !== undefined && context.commits.length > 0) {
    sections.push(`## Changes\n\n${context.commits.map((commit) => `- ${commit}`).join('\n')}`)
  }
  if (sections.length === 0) sections.push('## Changes\n\n(see commits)')
  return sections.join('\n\n')
}

/** Assemble the `gh pr create` argv (pure). */
export function buildCreatePrArgs(options: {
  title: string
  body: string
  base?: string
  draft?: boolean
}): string[] {
  const args = ['pr', 'create', '--title', options.title, '--body', options.body]
  if (options.base !== undefined) args.push('--base', options.base)
  if (options.draft === true) args.push('--draft')
  return args
}

export function isGhAuthenticated(cwd: string): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { cwd, encoding: 'utf-8', timeout: 30_000 })
  return result.status === 0
}

export class CreatePrTool {
  readonly name = 'create_pr'
  readonly description =
    'Push the current branch and open a GitHub PR with a description generated from conversation context and recent commits.'
  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'PR title (default: from the latest commit)' },
      contextSummary: { type: 'string', description: 'conversation context for the PR body' },
      base: { type: 'string', description: 'base branch (default: repo default)' },
      draft: { type: 'boolean', description: 'open as a draft PR' },
      cwd: { type: 'string' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<{ ok: boolean; output: string }> {
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd()

    const ghCheck = spawnSync('gh', ['--version'], { encoding: 'utf-8', timeout: 15_000 })
    if (ghCheck.status !== 0) return { ok: false, output: 'gh CLI is not installed' }
    if (!isGhAuthenticated(cwd))
      return { ok: false, output: 'gh is not authenticated - run `gh auth login`' }

    const push = run(cwd, ['push', '-u', 'origin', 'HEAD'])
    if (!push.ok) return { ok: false, output: `git push failed: ${push.output}` }

    const log = run(cwd, ['log', '--pretty=format:%s', '-10'])
    const commits = log.ok ? log.output.split('\n').filter((line) => line.length > 0) : []

    const title =
      typeof input.title === 'string' && input.title.trim().length > 0
        ? input.title.trim()
        : (commits[0] ?? 'Forge changes')
    const body = buildPrBody({
      contextSummary: typeof input.contextSummary === 'string' ? input.contextSummary : undefined,
      commits,
    })
    const ghArgs = buildCreatePrArgs({
      title,
      body,
      base: typeof input.base === 'string' ? input.base : undefined,
      draft: input.draft === true,
    })

    const created = spawnSync('gh', ghArgs, { cwd, encoding: 'utf-8', timeout: 120_000 })
    const output = `${created.stdout ?? ''}${created.stderr ?? ''}`.trim()
    return created.status === 0
      ? { ok: true, output: output.length > 0 ? output : 'PR created' }
      : { ok: false, output: `gh pr create failed: ${output.slice(0, 400)}` }
  }
}

export const createPrTool = new CreatePrTool()
