import { describe, expect, it } from 'bun:test'
import {
  type PromptSection,
  applySectionOrder,
  composeSystemPrompt,
  estimateSectionTokens,
  section,
} from './system-prompt'

describe('PromptSection ordering', () => {
  it('orders sections by ascending priority', () => {
    const ordered = applySectionOrder([
      section('runtime', 'time: now', { priority: 500 }),
      section('memory', 'AGENTS.md rules', { priority: 100 }),
      section('base', 'You are forge.', { priority: 0 }),
    ])
    expect(ordered.map((s) => s.id)).toEqual(['base', 'memory', 'runtime'])
  })

  it('keeps stable order for equal priorities', () => {
    const ordered = applySectionOrder([
      section('a', 'a', { priority: 10 }),
      section('b', 'b', { priority: 10 }),
    ])
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('estimateSectionTokens', () => {
  it('estimates chars/4 like the context budgeter', () => {
    expect(estimateSectionTokens('abcd')).toBe(1)
    expect(estimateSectionTokens('x'.repeat(400))).toBe(100)
  })
})

describe('composeSystemPrompt', () => {
  const sections = (): PromptSection[] => [
    section('base', 'You are forge.', { priority: 0 }),
    section('memory', 'Always run tests.', { priority: 100 }),
    section('skills', 'Skill: plan-review', { priority: 200 }),
    section('tools', 'bash: run commands', { priority: 300 }),
    section('mcp', 'mcp_github: repo ops', { priority: 400 }),
    section('runtime', 'cwd: /tmp', { priority: 500 }),
  ]

  it('assembles all sections in priority order by default', () => {
    const result = composeSystemPrompt(sections())
    expect(result.prompt).toContain('You are forge.')
    expect(result.prompt).toContain('cwd: /tmp')
    expect(result.prompt.indexOf('You are forge.')).toBeLessThan(result.prompt.indexOf('cwd: /tmp'))
    expect(result.prompt.indexOf('bash: run commands')).toBeLessThan(
      result.prompt.indexOf('mcp_github: repo ops'),
    )
    expect(result.estimatedTokens).toBeGreaterThan(0)
    expect(result.sections.every((s) => s.included)).toBe(true)
  })

  it('excludes an empty section entirely', () => {
    const result = composeSystemPrompt([
      section('base', 'Root prompt', { priority: 0 }),
      section('skills', '   ', { priority: 200 }),
    ])
    expect(result.prompt).toContain('Root prompt')
    expect(result.prompt).not.toContain('skills')
    expect(result.sections.find((s) => s.id === 'skills')).toMatchObject({ included: false })
  })

  it('truncates later sections when the context budget is tight', () => {
    // Budget large enough for base+memory but not everything.
    const bigBody = 's'.repeat(400)
    const result = composeSystemPrompt(
      [
        section('base', 'Root instructions.', { priority: 0 }),
        section('memory', bigBody, { priority: 100 }),
        section('tools', bigBody, { priority: 300, truncate: true }),
        section('runtime', 'cwd: /tmp', { priority: 500 }),
      ],
      { budgetTokens: 200 },
    )
    const tool = result.sections.find((s) => s.id === 'tools')
    expect(tool?.included).toBe(true)
    expect(tool?.truncated).toBe(true)
    expect(tool?.content.length).toBeLessThan(bigBody.length)
    expect(result.estimatedTokens).toBeLessThanOrEqual(230)
    // Higher-priority sections keep their full content.
    expect(result.sections.find((s) => s.id === 'memory')?.truncated).toBe(false)
  })

  it('drops a truncate-eligible section entirely when even its minimum does not fit', () => {
    const result = composeSystemPrompt(
      [
        section('base', 'b'.repeat(8000), { priority: 0 }),
        section('skills', 'y'.repeat(800), { priority: 200, truncate: true, minChars: 400 }),
      ],
      { budgetTokens: 2100 },
    )
    const skills = result.sections.find((s) => s.id === 'skills')
    expect(skills?.included).toBe(false)
  })

  it('never truncates a section that opted out', () => {
    const result = composeSystemPrompt(
      [
        section('memory', 'm'.repeat(2000), { priority: 100 }),
        section('skills', 'k'.repeat(2000), { priority: 200, truncate: false }),
      ],
      { budgetTokens: 1000 },
    )
    expect(result.sections.find((s) => s.id === 'memory')).toMatchObject({
      included: true,
      truncated: false,
    })
    expect(result.sections.find((s) => s.id === 'skills')?.included).toBe(false)
  })
})
