import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentModel, AgentTool } from '../agent/types'
import { definitionToSpawnOptions, loadAgentDefinitions } from './definitions'

const REVIEWER_MD = `---
name: reviewer
description: Reviews code changes for quality.
tools:
  - read
  - grep
model: test/cheap-model
skills:
  - code-review
isolation: inherit
---

You are a strict code reviewer. Report findings only.
`

describe('loadAgentDefinitions (Phase 94)', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-agents-'))
    const dir = join(root, '.forge', 'agents')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'reviewer.md'), REVIEWER_MD, 'utf-8')
    writeFileSync(
      join(dir, 'inline-tools.md'),
      '---\nname: helper\ndescription: helpers with inline tools\ntools: [read, write]\n---\n\nHelper body.',
      'utf-8',
    )
    writeFileSync(join(dir, 'broken.md'), 'no frontmatter here', 'utf-8')
    writeFileSync(join(dir, 'nameless.md'), '---\ndescription: missing name\n---\n\nBody.', 'utf-8')
    writeFileSync(join(root, 'stray.md'), '---\nname: stray\n---\n\nbody', 'utf-8')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('loads definitions from .forge/agents with parsed frontmatter + body prompt', () => {
    const { definitions, errors } = loadAgentDefinitions(root)
    const reviewer = definitions.find((d) => d.name === 'reviewer')
    expect(reviewer).toBeDefined()
    expect(reviewer?.description).toBe('Reviews code changes for quality.')
    expect(reviewer?.tools).toEqual(['read', 'grep'])
    expect(reviewer?.model).toBe('test/cheap-model')
    expect(reviewer?.skills).toEqual(['code-review'])
    expect(reviewer?.isolation).toBe('inherit')
    expect(reviewer?.systemPrompt).toContain('strict code reviewer')
    // Malformed files surface as errors, never throw.
    expect(errors.some((e) => e.path.endsWith('broken.md'))).toBe(true)
    expect(errors.some((e) => e.path.endsWith('nameless.md'))).toBe(true)
    // Only .forge/agents is walked.
    expect(definitions.some((d) => d.name === 'stray')).toBe(false)
  })

  it('parses inline-list tool syntax', () => {
    const { definitions } = loadAgentDefinitions(root)
    const helper = definitions.find((d) => d.name === 'helper')
    expect(helper?.tools).toEqual(['read', 'write'])
  })

  it('maps a definition onto spawn options with an allowlist-narrowed tool set', () => {
    const { definitions } = loadAgentDefinitions(root)
    const reviewer = definitions.find((d) => d.name === 'reviewer')
    expect(reviewer).toBeDefined()

    const registry: AgentTool[] = [
      { name: 'read', description: 'r', execute: async () => 'r' },
      { name: 'grep', description: 'g', execute: async () => 'g' },
      { name: 'write', description: 'w', execute: async () => 'w' },
    ]
    const model: AgentModel = {
      id: 'test/cheap-model',
      provider: 'test',
      config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
      stream: function* () {} as unknown as AgentModel['stream'],
    }

    const options = definitionToSpawnOptions(
      reviewer ??
        (() => {
          throw new Error('reviewer definition not loaded')
        })(),
      { model, tools: registry },
      { task: 'Review the diff.' },
    )
    expect(options.systemPrompt).toContain('strict code reviewer')
    expect(options.task).toBe('Review the diff.')
    expect(options.tools?.map((t) => t.name)).toEqual(['read', 'grep'])
    expect(model.id).toBe('test/cheap-model')
  })

  it('returns empty results for a missing directory without throwing', () => {
    const loaded = loadAgentDefinitions(join(root, 'nope'))
    expect(loaded.definitions).toEqual([])
    expect(loaded.errors).toEqual([])
  })
})
