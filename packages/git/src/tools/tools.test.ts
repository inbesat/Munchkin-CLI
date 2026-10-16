import { afterEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CreatePrTool, buildCreatePrArgs, buildPrBody, isGhAuthenticated } from './create-pr'
import { ReviewPrTool, reviewDiff } from './review-pr'
import { SmartCommitTool, generateCommitMessage, readStatusEntries } from './smart-commit'

describe('smart commit (Phase 133)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function initRepo(): { dir: string; file: string } {
    const dir = mkdtempSync(join(tmpdir(), 'forge-commit-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'README.md'), '# repo\n', 'utf-8')
    spawnSync('git', ['init', '--initial-branch=main'], { cwd: dir, encoding: 'utf-8' })
    spawnSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
    spawnSync('git', ['config', 'user.name', 't'], { cwd: dir })
    spawnSync('git', ['add', '-A'], { cwd: dir })
    spawnSync('git', ['commit', '-m', 'chore: seed', '--no-gpg-sign'], { cwd: dir })
    return { dir, file: join(dir, 'src', 'feature.ts') }
  }

  it('generates a conventional message from file types', () => {
    const message = generateCommitMessage(
      [
        { path: 'packages/core/src/feature.ts', status: '??' },
        { path: 'packages/core/src/other.ts', status: 'M ' },
      ],
      '',
    )
    expect(message.type).toBe('feat')
    expect(message.scope).toBe('src')
    expect(message.message).toBe('feat(src): update 2 file(s): 1 added, 1 modified')
  })

  it('classifies test and docs changes', () => {
    expect(generateCommitMessage([{ path: 'pkgs/x/src/a.test.ts', status: 'M ' }]).type).toBe(
      'test',
    )
    expect(generateCommitMessage([{ path: 'docs/guide.md', status: 'M ' }]).type).toBe('docs')
  })

  it('commits generated conventional messages end-to-end in a temp repo', async () => {
    const { dir, file } = initRepo()
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(file, 'body\n', 'utf-8')

    const tool = new SmartCommitTool()
    const result = await tool.execute({ cwd: dir })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.message).toMatch(/^feat\(src\): update 1 file\(s\)/)
      const log = spawnSync('git', ['log', '-1', '--pretty=format:%s'], {
        cwd: dir,
        encoding: 'utf-8',
      })
      expect(log.stdout).toBe(result.message)
    }
  })

  it('dry-run builds the message without committing, and explicit messages are honored', async () => {
    const { dir } = initRepo()
    writeFileSync(join(dir, 'notes.md'), 'x\n', 'utf-8')
    const tool = new SmartCommitTool()

    const dry = await tool.execute({ cwd: dir, dryRun: true })
    expect(dry.ok).toBe(true)
    if (dry.ok) expect(dry.committed).toBe(false)
    const log = spawnSync('git', ['log', '-1', '--pretty=format:%s'], {
      cwd: dir,
      encoding: 'utf-8',
    })
    expect(log.stdout).toBe('chore: seed')

    const explicit = await tool.execute({ cwd: dir, message: 'docs: rewrite notes' })
    expect(explicit.ok).toBe(true)
    const log2 = spawnSync('git', ['log', '-1', '--pretty=format:%s'], {
      cwd: dir,
      encoding: 'utf-8',
    })
    expect(log2.stdout).toBe('docs: rewrite notes')
  })

  it('readStatus parses porcelain entries', () => {
    const { dir } = initRepo()
    writeFileSync(join(dir, 'new.txt'), 'x\n', 'utf-8')
    const entries = readStatusEntries(dir)
    expect(entries.ok).toBe(true)
    if (entries.ok) expect(entries.entries[0]?.status).toBe('??')
  })
})

describe('create PR (Phase 133)', () => {
  it('builds a PR body with context + commit sections', () => {
    const body = buildPrBody({
      contextSummary: 'The user asked to refactor the parser and add tests.',
      commits: ['refactor(core): parser split', 'test(core): parser regressions'],
    })
    expect(body).toContain('## Context')
    expect(body).toContain('refactor the parser')
    expect(body).toContain('- refactor(core): parser split')
  })

  it('renders a fallback body without context or commits', () => {
    const body = buildPrBody({})
    expect(body).toContain('## Changes')
    expect(body).toContain('(see commits)')
  })

  it('assembles gh pr create argv with base and draft options', () => {
    const args = buildCreatePrArgs({ title: 'T', body: 'B', base: 'develop', draft: true })
    expect(args).toEqual([
      'pr',
      'create',
      '--title',
      'T',
      '--body',
      'B',
      '--base',
      'develop',
      '--draft',
    ])
  })

  it('CreatePrTool degrades cleanly when gh is missing or unauthenticated', async () => {
    const tool = new CreatePrTool()
    const authenticated = isGhAuthenticated(process.cwd())
    if (!authenticated) {
      const result = await tool.execute({})
      expect(result.ok).toBe(false)
      expect(result.output).toMatch(/gh (is not|not authenticated)/)
      return
    }
    // gh authenticated on this machine - the tool must respond, not throw.
    const result = await tool.execute({ title: 'Forge test PR', base: 'main', draft: true })
    expect(typeof result.output).toBe('string')
  }, 120_000)
})

describe('review PR (Phase 133)', () => {
  it('flags added secrets at high severity', () => {
    const review = reviewDiff(
      [
        'diff --git a/src/cfg.ts b/src/cfg.ts',
        '--- a/src/cfg.ts',
        '+++ b/src/cfg.ts',
        '@@ -1,2 +1,3 @@',
        ' const x = 1',
        "+ const apiKey = 'AKIAIOSFODNN7EXAMPLE-EXTRA'",
      ].join('\n'),
    )
    expect(
      review.findings.some(
        (f) => f.severity === 'high' && f.finding.toLowerCase().includes('api key'),
      ),
    ).toBe(true)
    expect(review.riskLevel).toBe('high')
  })

  it('flags large untested additions at medium severity', () => {
    const lines = [
      'diff --git a/src/big.ts b/src/big.ts',
      '--- a/src/big.ts',
      '+++ b/src/big.ts',
      '@@ -0,0 +1,60 @@',
    ]
    for (let i = 0; i < 60; i++) lines.push(`+ line ${i}`)
    const review = reviewDiff(lines.join('\n'))
    expect(review.additions).toBe(60)
    expect(review.findings.some((f) => f.finding.includes('without any test file'))).toBe(true)
    expect(review.riskLevel).toBe('medium')
  })

  it('low-risk clean diffs produce no findings', () => {
    const review = reviewDiff(
      [
        'diff --git a/src/small.ts b/src/small.ts',
        '--- a/src/small.ts',
        '+++ b/src/small.ts',
        '@@ -1,0 +2 @@',
        '+ x',
        '+ y',
      ].join('\n'),
    )
    expect(review.riskLevel).toBe('low')
  })

  it('ReviewPrTool degrades cleanly without gh or on unauthenticated machines', async () => {
    const tool = new ReviewPrTool()
    if (!isGhAuthenticated(process.cwd())) {
      const result = await tool.execute({ prNumber: 1 })
      expect(result.ok).toBe(false)
      return
    }
    const result = await tool.execute({ prNumber: 999999 })
    expect(typeof result.output).toBe('string')
  }, 120_000)
})
