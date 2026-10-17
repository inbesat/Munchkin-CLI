import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRules } from './rules'

describe('loadRules (Phase 89)', () => {
  let root: string
  let rulesDir: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-rules-'))
    rulesDir = join(root, '.forge', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'typescript-conventions.md'), 'Use strict types.', 'utf-8')
    writeFileSync(join(rulesDir, 'testing-standards.md'), 'Tests before code.', 'utf-8')
    writeFileSync(join(rulesDir, 'style.md'), 'No semicolons needed.', 'utf-8')
    writeFileSync(
      join(rulesDir, 'with-imports.md'),
      'Base rule.\n@import ./shared/terms.md',
      'utf-8',
    )
    mkdirSync(join(rulesDir, 'shared'), { recursive: true })
    writeFileSync(join(rulesDir, 'shared', 'terms.md'), 'Shared terms live here.', 'utf-8')
    writeFileSync(join(rulesDir, 'cyclic-a.md'), 'A\n@import ./cyclic-b.md', 'utf-8')
    writeFileSync(join(rulesDir, 'cyclic-b.md'), 'B\n@import ./cyclic-a.md', 'utf-8')
    writeFileSync(join(rulesDir, 'broken.md'), 'X\n@import ./missing-file.md', 'utf-8')
    mkdirSync(join(rulesDir, 'nested'), { recursive: true })
    writeFileSync(join(rulesDir, 'nested', 'deep.md'), 'Should not load.', 'utf-8')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('loads all top-level rules sorted by filename', () => {
    const loaded = loadRules(root)
    const names = loaded.rules.map((r) => r.name)
    expect(names).toContain('typescript-conventions.md')
    expect(names).toContain('testing-standards.md')
    expect(names).toContain('style.md')
    expect(names).toContain('with-imports.md')
    // Only *.md directly in the rules dir; nested dirs are not walked.
    expect(names).not.toContain('deep.md')
    // Top-level rules load sorted by name; @imported rules interleave after
    // their importer, so only the top-level sequence is asserted sorted.
    const topLevel = loaded.rules.filter((r) => r.importedBy.length === 0).map((r) => r.name)
    expect(topLevel).toEqual([...topLevel].sort())
  })

  it('inlines @import targets as separate loaded rules, deduplicated', () => {
    const loaded = loadRules(root, { include: ['with-imports.md'] })
    const names = loaded.rules.map((r) => r.name)
    expect(names).toEqual(['with-imports.md', 'terms.md'])
    expect(loaded.errors).toEqual([])
  })

  it('is cycle-safe: cyclic imports do not hang or duplicate', () => {
    const loaded = loadRules(root, { include: ['cyclic-a.md'] })
    const names = loaded.rules.map((r) => r.name).sort()
    expect(names).toEqual(['cyclic-a.md', 'cyclic-b.md'])
    expect(loaded.errors).toEqual([])
  })

  it('records missing imports in errors instead of throwing', () => {
    const loaded = loadRules(root, { include: ['broken.md'] })
    expect(loaded.rules.map((r) => r.name)).toEqual(['broken.md'])
    expect(loaded.errors.length).toBe(1)
    expect(loaded.errors[0]?.reason).toContain('missing-file.md')
  })

  it('supports selective loading via include', () => {
    const loaded = loadRules(root, { include: ['testing-standards.md'] })
    expect(loaded.rules.map((r) => r.name)).toEqual(['testing-standards.md'])
  })

  it('returns empty results for a missing rules directory without throwing', () => {
    const loaded = loadRules(join(root, 'nope'))
    expect(loaded.rules).toEqual([])
    expect(loaded.errors).toEqual([])
  })
})
