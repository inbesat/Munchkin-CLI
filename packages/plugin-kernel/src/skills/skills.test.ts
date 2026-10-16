import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkills } from './loader'
import { invokeSkill, matchSkills } from './matcher'

let project: string
let home: string

const PROJECT_SKILL = `---
name: test-runner
description: Runs the project test suite and summarizes failures.
triggers:
  - run tests
  - failing tests
---

Run bun test. Report failures with file paths.
`

const HOME_SKILL = `---
name: deploy-notes
description: Drafts deploy notes for a release.
triggers:
  - deploy
---

Draft concise deploy notes.
`

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'forge-skills-proj-'))
  home = mkdtempSync(join(tmpdir(), 'forge-skills-home-'))

  const projectDir = join(project, '.forge', 'skills', 'test-runner')
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(projectDir, 'SKILL.md'), PROJECT_SKILL, 'utf-8')

  const homeDir = join(home, '.config', 'forge', 'skills')
  mkdirSync(join(homeDir, 'deploy-notes'), { recursive: true })
  writeFileSync(join(homeDir, 'deploy-notes', 'SKILL.md'), HOME_SKILL, 'utf-8')
})

afterAll(() => {
  rmSync(project, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

describe('loadSkills (Phase 106)', () => {
  it('loads project + home skills with source attribution', () => {
    const { skills, errors } = loadSkills({ projectRoot: project, homeDir: home })
    expect(errors).toEqual([])
    const names = skills.map((s) => s.name)
    expect(names).toContain('test-runner')
    expect(names).toContain('deploy-notes')
    const runner = skills.find((s) => s.name === 'test-runner')
    expect(runner?.source).toBe('project')
    expect(runner?.triggers).toEqual(['run tests', 'failing tests'])
    expect(runner?.description).toContain('test suite')
    expect(runner?.body).toContain('bun test')
  })

  it('project skills win over home skills on name collision', () => {
    const homeDir = join(home, '.config', 'forge', 'skills')
    mkdirSync(join(homeDir, 'test-runner'), { recursive: true })
    writeFileSync(
      join(homeDir, 'test-runner', 'SKILL.md'),
      '---\nname: test-runner\ndescription: home variant\n---\n\nhome body',
      'utf-8',
    )
    const { skills } = loadSkills({ projectRoot: project, homeDir })
    const runner = skills.find((s) => s.name === 'test-runner')
    expect(runner?.source).toBe('project')
    expect(runner?.description).not.toBe('home variant')
  })

  it('records malformed skills as errors and returns empty for missing dirs', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'forge-skills-bad-'))
    const dir = join(orphan, '.forge', 'skills')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bad.md'), 'no frontmatter', 'utf-8')
    const { skills, errors } = loadSkills({ projectRoot: orphan, homeDir: join(orphan, 'nohome') })
    expect(skills).toEqual([])
    expect(errors.length).toBe(1)
    rmSync(orphan, { recursive: true, force: true })
  })
})

describe('matchSkills (Phase 106)', () => {
  /** describe bodies run at collection time — load inside each test. */
  function testSkills(): ReturnType<typeof loadSkills>['skills'] {
    return loadSkills({ projectRoot: project, homeDir: home }).skills
  }

  it('matches a conversation by trigger text', () => {
    const matches = matchSkills(testSkills(), 'the tests are failing again, please run tests')
    expect(matches[0]?.skill.name).toBe('test-runner')
    expect(matches[0]?.score).toBeGreaterThan(0)
  })

  it('matches by description keywords', () => {
    const matches = matchSkills(testSkills(), 'write deploy notes for release 2.0')
    expect(matches[0]?.skill.name).toBe('deploy-notes')
  })

  it('returns no matches for unrelated conversations', () => {
    expect(matchSkills(testSkills(), 'paint the fence red')).toEqual([])
  })

  it('supports manual invocation by name', () => {
    const skills = testSkills()
    expect(invokeSkill(skills, 'test-runner')?.body).toContain('bun test')
    expect(invokeSkill(skills, '/test-runner')?.name).toBe('test-runner')
    expect(invokeSkill(skills, 'nonexistent')).toBeUndefined()
  })
})
