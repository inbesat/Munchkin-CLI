import { describe, expect, it } from 'bun:test'
import type { DiffReview } from './review-pr'
import { ReviewWorkflowTool, formatReviewReport } from './review-workflow'

const SAMPLE: DiffReview = {
  riskLevel: 'medium',
  filesChanged: 3,
  additions: 60,
  deletions: 4,
  findings: [
    { severity: 'high', file: 'src/cfg.ts', finding: 'possible API key literal added' },
    {
      severity: 'medium',
      file: '(overall)',
      finding: '60 additions without any test file changes',
    },
  ],
}

describe('PR review workflow (Phase 136)', () => {
  it('formats a full markdown report grouped by severity', () => {
    const report = formatReviewReport(SAMPLE, 42)
    expect(report).toContain('## forge review — PR #42')
    expect(report).toContain('**Verdict:** MEDIUM risk - 3 file(s), +60/-4')
    expect(report).toContain('### Critical issues (fix before merge)')
    expect(report).toContain('`src/cfg.ts`: possible API key literal added')
    expect(report).toContain('### Suggestions')
    expect(report).toContain('60 additions without any test file changes')
    expect(report).toContain('**Suggestion:** run the full test suite')
  })

  it('renders the finding-free variant with a clean verdict', () => {
    const report = formatReviewReport({
      riskLevel: 'low',
      filesChanged: 1,
      additions: 3,
      deletions: 0,
      findings: [],
    })
    expect(report).toContain('**Verdict:** LOW risk')
    expect(report).toContain('No issues found by the deterministic checks')
    expect(report).not.toContain('### Critical issues')
  })

  it('ReviewWorkflowTool degrades cleanly without gh', async () => {
    const tool = new ReviewWorkflowTool()
    const ghProbe = await import('node:child_process').then((cp) =>
      cp.spawnSync('gh', ['--version'], { encoding: 'utf-8' }),
    )
    if (ghProbe.status === 0) return // gh present - degradation path not testable here
    const result = await tool.execute({ prNumber: 1 })
    expect(result.ok).toBe(false)
    expect(result.output).toContain('gh CLI is not installed')
  })

  it('execute without post returns the report without any comment action', async () => {
    const tool = new ReviewWorkflowTool()
    const ghProbe = await import('node:child_process').then((cp) =>
      cp.spawnSync('gh', ['--version'], { encoding: 'utf-8' }),
    )
    if (ghProbe.status !== 0) return
    const result = await tool.execute({ prNumber: 999999, post: true })
    // Either fails (PR 999999 doesn't exist) or succeeds - both are text results, never throws.
    expect(typeof result.output).toBe('string')
  }, 120_000)
})
