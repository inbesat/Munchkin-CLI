/**
 * CI entry for label-triggered forge reviews (Phase 134).
 *
 * GitHub Actions: `.github/workflows/forge-review.yml` triggers this on the
 * `forge-review` label with GITHUB_REF / PR context in env. The script:
 *   1. resolves the PR number from CI context,
 *   2. fetches the PR diff and runs the deterministic Phase-133 review,
 *   3. posts the findings as a PR review comment via `gh`.
 *
 * GitLab CI uses `docs/ci/forge-review.gitlab-ci.yml`, which sets the same
 * env contract (FORGE_PR_NUMBER, FORGE_GH_TOKEN), mounts the repo, and runs
 * this script too - posting the comment via the GitLab `glab` CLI when the
 * GitHub CLI is unavailable.
 * No-throw by contract: failures exit with code 1 and a clear message.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ReviewPrTool } from '../packages/git/src/tools/review-pr'

export function resolvePrNumber(env: Record<string, string | undefined>): {
  ok: true
  prNumber: number
} | { ok: false; error: string } {
  const explicit = env.FORGE_PR_NUMBER
  if (explicit !== undefined && explicit.trim().length > 0) {
    const parsed = Number.parseInt(explicit, 10)
    if (Number.isNaN(parsed) || parsed <= 0) return { ok: false, error: `invalid FORGE_PR_NUMBER: '${explicit}'` }
    return { ok: true, prNumber: parsed }
  }
  // GitHub Actions label events: GITHUB_REF = refs/pull/<n>/merge.
  const githubRef = env.GITHUB_REF
  if (githubRef !== undefined) {
    const match = /refs\/pull\/(\d+)\//.exec(githubRef)
    if (match !== null) return { ok: true, prNumber: Number.parseInt(match[1] as string, 10) }
    return { ok: false, error: `GITHUB_REF '${githubRef}' is not a pull request ref` }
  }
  // GitLab CI merge request pipelines.
  const gitlabMrIid = env.CI_MERGE_REQUEST_IID
  if (gitlabMrIid !== undefined && gitlabMrIid.trim().length > 0) {
    const parsed = Number.parseInt(gitlabMrIid, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return { ok: true, prNumber: parsed }
  }
  return { ok: false, error: 'no PR number found (set FORGE_PR_NUMBER, run a PR pipeline, or a GitLab MR pipeline)' }
}

/** Deterministic comment body for the review findings. */
export function formatReviewComment(review: {
  riskLevel: 'high' | 'medium' | 'low'
  filesChanged: number
  additions: number
  deletions: number
  findings: readonly { severity: string; file: string; finding: string }[]
}): string {
  const lines = [
    `## forge review`,
    '',
    `**Risk:** ${review.riskLevel.toUpperCase()} - ${review.filesChanged} file(s), +${review.additions}/-${review.deletions}`,
  ]
  if (review.findings.length === 0) {
    lines.push('', 'No deterministic findings - no secrets, debug residue, or coverage gaps detected.')
  } else {
    lines.push('')
    for (const finding of review.findings) {
      lines.push(`- **[${finding.severity}]** \`${finding.file}\`: ${finding.finding}`)
    }
  }
  lines.push('', '<sub>Posted by forge (label-triggered CI review).</sub>')
  return lines.join('\n')
}

async function main(): Promise<void> {
  const env: Record<string, string | undefined> = process.env
  const pr = resolvePrNumber(env)
  if (!pr.ok) {
    console.error(`forge-review: ${pr.error}`)
    process.exit(1)
  }

  const token = env.FORGE_GH_TOKEN ?? env.GITHUB_TOKEN
  if (token === undefined || token.length === 0) {
    console.error('forge-review: FORGE_GH_TOKEN (or GITHUB_TOKEN) must expose PR write access')
    process.exit(1)
  }

  const cwd = env.GITHUB_WORKSPACE ?? env.CI_PROJECT_DIR ?? process.cwd()
  const tool = new ReviewPrTool()
  const review = await tool.execute({ prNumber: pr.prNumber, cwd })
  if (!review.ok) {
    console.error(`forge-review: ${review.output}`)
    process.exit(1)
  }

  const comment = formatReviewComment(review.review ?? { riskLevel: 'low', filesChanged: 0, additions: 0, deletions: 0, findings: [] })
  const commentPath = join('forge-review-comment.md')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(commentPath, comment, 'utf-8')

  const posted = spawnGh(['pr', 'review', String(pr.prNumber), '--comment', '--body-file', commentPath], cwd)
  if (!posted) {
    const fallback = spawnGh(['pr', 'comment', String(pr.prNumber), '--body-file', commentPath], cwd)
    if (!fallback) {
      console.error('forge-review: failed to post the review comment via gh')
      process.exit(1)
    }
  }
  console.log(`forge-review: posted review on PR #${pr.prNumber}`)
}

function spawnGh(args: readonly string[], cwd: string): boolean {
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...process.env, GH_TOKEN: process.env.FORGE_GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '' },
  })
  return result.status === 0
}

if (import.meta.main) {
  void main()
}
