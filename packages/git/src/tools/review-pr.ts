/**
 * ReviewPR (Phase 133): fetches a PR's diff via `gh pr diff` and produces
 * deterministic, non-LLM review feedback: security smells, debug residue,
 * test coverage hints, oversized hunks. The pure analyzer is unit-testable;
 * the tool wrapper degrades cleanly when gh is unavailable.
 */

import { spawnSync } from 'node:child_process'

export interface ReviewFinding {
  severity: 'high' | 'medium' | 'low'
  file: string
  finding: string
}

export interface DiffReview {
  findings: ReviewFinding[]
  riskLevel: 'high' | 'medium' | 'low'
  filesChanged: number
  additions: number
  deletions: number
}

const SECRET_PATTERNS: [string, RegExp][] = [
  [
    'possible API key literal',
    /(?:sk-ant-|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16})/,
  ],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['hardcoded credential assignment', /(?:password|secret|api_?key)\s*=\s*["'][^"']{8,}["']/i],
]

const DEBUG_RESIDUE = /(?:console\.(?:log|debug)|debugger|print\s*\()/

export function reviewDiff(diff: string): DiffReview {
  const findings: ReviewFinding[] = []
  let additions = 0
  let deletions = 0
  let currentFile = ''
  let testsTouched = false
  let docsTouched = false
  let largeHunks = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = /b\/(.+)$/.exec(line)
      currentFile = match?.[1] ?? ''
      if (currentFile.includes('test') || currentFile.includes('spec')) testsTouched = true
      if (currentFile.endsWith('.md') || currentFile.includes('docs')) docsTouched = true
    } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      // header noise
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1
      const content = line.slice(1)
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          findings.push({ severity: 'high', file: currentFile, finding: `${label} added` })
          break
        }
      }
      if (DEBUG_RESIDUE.test(content) && !currentFile.includes('.test.')) {
        findings.push({ severity: 'low', file: currentFile, finding: 'debug residue added' })
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1
    } else if (/^@@/.test(line)) {
      // hunk header - count changed lines per hunk below via additions/deletions deltas
      largeHunks = additions + deletions > 400 ? largeHunks + 1 : largeHunks
    }
  }

  if (largeHunks > 3) {
    findings.push({
      severity: 'medium',
      file: currentFile,
      finding: `${largeHunks} hunks exceed the 400-line review threshold`,
    })
  }
  if (additions > 50 && !testsTouched) {
    findings.push({
      severity: 'medium',
      file: '(overall)',
      finding: `${additions} additions without any test file changes`,
    })
  }
  if (additions > 10 && !docsTouched) {
    findings.push({
      severity: 'low',
      file: '(overall)',
      finding: 'consider updating docs for user-facing changes',
    })
  }

  const highCount = findings.filter((f) => f.severity === 'high').length
  const mediumCount = findings.filter((f) => f.severity === 'medium').length
  return {
    findings,
    riskLevel: highCount > 0 ? 'high' : mediumCount > 0 ? 'medium' : 'low',
    filesChanged: currentFile === '' ? 0 : (diff.match(/^diff --git/gm)?.length ?? 0),
    additions,
    deletions,
  }
}

export class ReviewPrTool {
  readonly name = 'review_pr'
  readonly description =
    'Fetch a GitHub PR diff via `gh` and return deterministic review feedback (security smells, debug residue, coverage hints, risk level).'
  readonly parameters = {
    type: 'object',
    properties: {
      prNumber: { type: 'number', description: 'PR number (default: current branch PR)' },
      cwd: { type: 'string' },
    },
  }

  async execute(input: Record<string, unknown>): Promise<{
    ok: boolean
    output: string
    review?: DiffReview
  }> {
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd()
    const ghCheck = spawnSync('gh', ['--version'], { encoding: 'utf-8', timeout: 15_000 })
    if (ghCheck.status !== 0) return { ok: false, output: 'gh CLI is not installed' }

    const args = ['pr', 'diff']
    if (typeof input.prNumber === 'number') args.push(input.prNumber.toString())
    const diff = spawnSync('gh', args, { cwd, encoding: 'utf-8', timeout: 60_000 })
    if (diff.status !== 0) {
      const output = `${diff.stdout ?? ''}${diff.stderr ?? ''}`.trim()
      return { ok: false, output: `gh pr diff failed: ${output.slice(0, 400)}` }
    }

    const review = reviewDiff(diff.stdout ?? '')
    const summary = [
      `Risk: ${review.riskLevel.toUpperCase()} - ${review.filesChanged} file(s), +${review.additions}/-${review.deletions}`,
      ...review.findings.map((f) => `  [${f.severity}] ${f.file}: ${f.finding}`),
    ]
    return { ok: true, output: summary.join('\n'), review }
  }
}

export const reviewPrTool = new ReviewPrTool()
