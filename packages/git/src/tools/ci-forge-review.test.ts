import { describe, expect, it } from 'bun:test'
import { formatReviewComment, resolvePrNumber } from '../../../../scripts/ci-forge-review'

describe('CI forge-review integration (Phase 134)', () => {
  it('resolves the PR number from the GitHub label-event ref', () => {
    expect(resolvePrNumber({ GITHUB_REF: 'refs/pull/42/merge' })).toEqual({
      ok: true,
      prNumber: 42,
    })
  })

  it('resolves the PR number from the GitLab MR iid', () => {
    expect(resolvePrNumber({ CI_MERGE_REQUEST_IID: '7' })).toEqual({ ok: true, prNumber: 7 })
  })

  it('FORGE_PR_NUMBER overrides CI context', () => {
    expect(resolvePrNumber({ GITHUB_REF: 'refs/pull/42/merge', FORGE_PR_NUMBER: '99' })).toEqual({
      ok: true,
      prNumber: 99,
    })
  })

  it('rejects invalid and missing PR context without throwing', () => {
    const invalid = resolvePrNumber({ FORGE_PR_NUMBER: 'abc' })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error).toContain("invalid FORGE_PR_NUMBER: 'abc'")

    const none = resolvePrNumber({})
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.error).toContain('no PR number found')
  })

  it('formats the review comment with risk, counts, and findings', () => {
    const comment = formatReviewComment({
      riskLevel: 'high',
      filesChanged: 3,
      additions: 90,
      deletions: 4,
      findings: [
        { severity: 'high', file: 'src/cfg.ts', finding: 'possible API key literal added' },
      ],
    })
    expect(comment).toContain('## forge review')
    expect(comment).toContain('**Risk:** HIGH - 3 file(s), +90/-4')
    expect(comment).toContain('**[high]** `src/cfg.ts`: possible API key literal added')
    expect(comment).toContain('label-triggered CI review')
  })

  it('formats a finding-free comment variant', () => {
    const comment = formatReviewComment({
      riskLevel: 'low',
      filesChanged: 1,
      additions: 3,
      deletions: 0,
      findings: [],
    })
    expect(comment).toContain('No deterministic findings')
    expect(comment).toContain('**Risk:** LOW')
  })
})
