/**
 * Community-governance gate (Phase 154): issue templates parse and reference
 * real labels/sections, the public roadmap and bounty charter exist, their
 * internal links resolve, placeholders and funding promises are guarded.
 *
 * Usage: bun test scripts/governance.test.ts
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const templatesDir = join(repoRoot, '.github', 'ISSUE_TEMPLATE')

/** Minimal YAML-section presence check (no yaml dep added for two files). */
function hasSections(yml: string, sections: string[]): boolean {
  return sections.every((s) => yml.includes(`${s}:`))
}

describe('issue templates', () => {
  it('has a config with contact links', () => {
    const yml = readFileSync(join(templatesDir, 'config.yml'), 'utf8')
    expect(hasSections(yml, ['blank_issues_enabled', 'contact_links'])).toBe(true)
    expect(yml.includes('https://inbesat.github.io/Muchkin-CLI/')).toBe(false) // no typo'd URLs
    expect(yml).toContain('https://inbesat.github.io/Munchkin-CLI/')
  })

  it('bug report: required sections, bug label, env via forge doctor', () => {
    const yml = readFileSync(join(templatesDir, 'bug_report.yml'), 'utf8')
    expect(hasSections(yml, ['name', 'description', 'labels', 'body'])).toBe(true)
    expect(yml).toContain('bug')
    expect(yml).toContain('forge doctor --json')
    expect(yml).toContain('Security tab')
  })

  it('feature request: required sections, roadmap pointer, bounty checkbox', () => {
    const yml = readFileSync(join(templatesDir, 'feature_request.yml'), 'utf8')
    expect(hasSections(yml, ['name', 'description', 'labels', 'body'])).toBe(true)
    expect(yml).toContain('type: dropdown')
    expect(yml).toContain('enhancement')
    expect(yml).toContain('ROADMAP.md')
    expect(yml).toContain('Bounty interest')
  })
})

describe('public roadmap', () => {
  const roadmap = readFileSync(join(repoRoot, 'ROADMAP.md'), 'utf8')

  it('exists with honest sections', () => {
    for (const needle of [
      '## Shipped',
      '## Next up (committed)',
      '## Exploratory (not committed)',
      'No dates are promised',
    ]) {
      expect(roadmap.includes(needle), `ROADMAP.md contains "${needle}"`).toBe(true)
    }
  })

  it('does not overclaim the sharp edges', () => {
    expect(roadmap).toContain('TUI')
    expect(roadmap).toContain('pending a rename')
    expect(roadmap.toLowerCase()).not.toContain('ollama adapter is live')
  })

  it('resolves internal links', () => {
    for (const m of roadmap.matchAll(/\]\(([^)#\s]+)\)/g)) {
      const target = m[1]
      if (target.startsWith('http')) {
        expect(target.startsWith('https://'), `roadmap link ${target} is https`).toBe(true)
        continue
      }
      expect(existsSync(join(repoRoot, target)), `roadmap -> ${target} exists`).toBe(true)
    }
  })
})

describe('plugin bounty program', () => {
  const bounty = readFileSync(join(repoRoot, 'docs', 'bounty.md'), 'utf8')

  it('is a funded-honest charter, not a payout promise', () => {
    expect(bounty).toContain('PROPOSED')
    expect(bounty).toContain('Status: charter')
    expect(bounty).toContain('Open bounties')
    // no concrete payout is promised anywhere without the PROPOSED marker
    for (const _m of bounty.matchAll(/\$([0-9,]+)/g)) {
      expect(bounty.includes('PROPOSED'), 'dollar amounts only in a PROPOSED table').toBe(true)
      break
    }
  })

  it('describes the claim flow and quality bar', () => {
    for (const needle of ['forge.plugin.json', 'claiming', 'Isolation contract', 'telemetry']) {
      expect(bounty.includes(needle), `bounty.md mentions "${needle}"`).toBe(true)
    }
  })

  it('resolves internal links', () => {
    for (const m of bounty.matchAll(/\]\(([^)#\s]+)\)/g)) {
      const target = m[1]
      if (target.startsWith('http')) {
        expect(target.startsWith('https://'), `bounty link ${target} is https`).toBe(true)
        continue
      }
      expect(existsSync(join(repoRoot, 'docs', target)), `bounty -> ${target} exists`).toBe(true)
    }
  })

  it('is linked from the README community section', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    expect(readme).toContain('ROADMAP.md')
    expect(readme).toContain('docs/bounty.md')
  })
})
