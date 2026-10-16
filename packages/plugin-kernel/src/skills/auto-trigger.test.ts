import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { autoTriggerSkills, loadAndAutoTrigger, semanticSimilarity } from './auto-trigger'
import type { LoadedSkill } from './loader'

const deploySkill = (body = 'Deploy the current build.'): LoadedSkill => ({
  path: 'builtin://deploy',
  name: 'deploy',
  description: 'deploy to production',
  triggers: [],
  source: 'project',
  body,
})

describe('semanticSimilarity (Phase 107)', () => {
  it('scores the blueprint pair: "deploy this" vs "deploy to production"', () => {
    const score = semanticSimilarity('deploy this', 'deploy to production')
    expect(score).toBeGreaterThan(0.3)
    // And it stays below perfect-similarity.
    expect(score).toBeLessThan(1)
  })

  it('scores identical text as 1', () => {
    expect(semanticSimilarity('deploy to production', 'deploy to production')).toBe(1)
  })

  it('scores unrelated text low', () => {
    expect(semanticSimilarity('deploy this', 'paint the fence red')).toBeLessThan(0.3)
  })
})

describe('autoTriggerSkills (Phase 107)', () => {
  it('auto-loads the deploy skill for "deploy this" (blueprint example)', () => {
    const matches = autoTriggerSkills([deploySkill()], 'deploy this please')
    expect(matches[0]?.skill.name).toBe('deploy')
    expect(matches[0]?.score).toBeGreaterThan(0.3)
  })

  it('returns no matches for unrelated conversations', () => {
    expect(autoTriggerSkills([deploySkill()], 'paint the fence red')).toEqual([])
  })

  it('ranks multiple skills by similarity and respects maxResults', () => {
    const skills = [
      deploySkill(),
      { ...deploySkill(), name: 'staging', description: 'deploy to staging' },
    ]
    const matches = autoTriggerSkills(skills, 'deploy this to production now', {
      maxResults: 1,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0]?.skill.description).toContain('production')
  })
})

describe('loadAndAutoTrigger (Phase 107)', () => {
  let project: string
  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'forge-autotrigger-'))
    const dir = join(project, '.forge', 'skills', 'deploy')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'SKILL.md'),
      '---\nname: deploy\ndescription: deploy to production\n---\n\nDo the deploy.',
      'utf-8',
    )
  })
  afterAll(() => {
    rmSync(project, { recursive: true, force: true })
  })

  it('combines the Phase-106 loader with auto-trigger', async () => {
    const matches = await loadAndAutoTrigger(
      { projectRoot: project },
      'can you deploy this for me?',
    )
    expect(matches[0]?.skill.name).toBe('deploy')
  })
})
