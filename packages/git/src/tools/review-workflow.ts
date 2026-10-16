/**
 * PR review workflow (Phase 136): combines the Phase-133 diff review with
 * a formatted markdown report and optional comment posting via `gh pr
 * review`. `formatReviewReport` is pure; the tool wraps gh and degrades
 * cleanly when unavailable (no-throw convention).
 */

import { spawnSync } from 'node:child_process'
import { type DiffReview, reviewDiff } from './review-pr'

export function formatReviewReport(review: DiffReview, prNumber?: number): string {
  const title = prNumber !== undefined ? `## forge review — PR #${prNumber}` : '## forge review'
  const lines: string[] = [
    title,
    '',
    `**Verdict:** ${review.riskLevel.toUpperCase()} risk - ${review.filesChanged} file(s), +${review.additions}/-${review.deletions}`,
  ]

  if (review.findings.length === 0) {
    lines.push(
      '',
      'No issues found by the deterministic checks: no secrets, no debug residue, and no coverage gaps detected.',
    )
  } else {
    const byGroup: Record<string, DiffReview['findings']> = { high: [], medium: [], low: [] }
    for (const finding of review.findings) byGroup[finding.severity]?.push(finding)
    const groups: [string, string][] = [
      ['high', '### Critical issues (fix before merge)'],
      ['medium', '### Suggestions'],
      ['low', '### Notes'],
    ]
    for (const [severity, heading] of groups) {
      const group = byGroup[severity]
      if (group === undefined || group.length === 0) continue
      lines.push('', heading)
      for (const finding of group) {
        lines.push(`- \`${finding.file}\`: ${finding.finding}`)
      }
    }
    lines.push(
      '',
      '**Suggestion:** run the full test suite and update docs for user-facing changes before merging.',
    )
  }
  return lines.join('\n')
}

export class ReviewWorkflowTool {
  readonly name = 'review_workflow'
  readonly description =
    'Fetch a PR diff, run the deterministic review analysis, output a formatted markdown report, and optionally post it as a PR review comment.'

  readonly parameters = {
    type: 'object',
    properties: {
      prNumber: { type: 'number', description: 'PR number (default: current branch PR)' },
      cwd: { type: 'string' },
      post: { type: 'boolean', description: 'post the report as a PR review (default false)' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<{
    ok: boolean
    output: string
    review?: DiffReview
  }> {
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd()
    const prNumber =
      typeof input.prNumber === 'number' && input.prNumber > 0 ? input.prNumber : undefined
    const ghCheck = spawnSync('gh', ['--version'], { encoding: 'utf-8', timeout: 15_000 })
    if (ghCheck.status !== 0) return { ok: false, output: 'gh CLI is not installed' }

    const diffArgs = ['pr', 'diff']
    if (prNumber !== undefined) diffArgs.push(prNumber.toString())
    const diff = spawnSync('gh', diffArgs, { cwd, encoding: 'utf-8', timeout: 60_000 })
    if (diff.status !== 0) {
      const detail = `${diff.stdout ?? ''}${diff.stderr ?? ''}`.trim()
      return { ok: false, output: `gh pr diff failed: ${detail.slice(0, 400)}` }
    }

    const review = reviewDiff(diff.stdout ?? '')
    const report = formatReviewReport(review, prNumber)

    const post = input.post === true
    if (!post) return { ok: true, output: report, review }

    const verdictArg = review.riskLevel === 'high' ? '--request-changes' : '--comment'
    const reviewArgs = ['pr', 'review']
    if (prNumber !== undefined) reviewArgs.push(prNumber.toString())
    reviewArgs.push(verdictArg, '--body', report)
    const posted = spawnSync('gh', reviewArgs, { cwd, encoding: 'utf-8', timeout: 60_000 })
    const postedOutput = `${posted.stdout ?? ''}${posted.stderr ?? ''}`.trim()
    if (posted.status !== 0) {
      return {
        ok: false,
        output: `report generated, but posting failed: ${postedOutput.slice(0, 400)}`,
        review,
      }
    }
    return { ok: true, output: `${report}\n\n(Posted as a PR review.)`, review }
  }
}

export const reviewWorkflowTool = new ReviewWorkflowTool()
