import { describe, expect, it } from 'bun:test'
import type { AgentChunk, AgentTool } from '../../agent/types'
import { definitionToSpawnOptions } from '../definitions'
import type { SpawnSubagentOptions } from '../spawn'
import { spawnSubagent } from '../spawn'
import { exploreAgent } from './explore'
import { generalAgent } from './general'
import { planAgent } from './plan'

const REGISTRY: AgentTool[] = [
  { name: 'read', description: 'read', execute: async () => 'body' },
  { name: 'glob', description: 'glob', execute: async () => '[]' },
  { name: 'grep', description: 'grep', execute: async () => 'matches' },
  { name: 'write', description: 'write', execute: async () => 'written' },
  { name: 'edit', description: 'edit', execute: async () => 'edited' },
  { name: 'bash', description: 'bash', execute: async () => 'ran' },
]

function scriptedModel(turns: AgentChunk[][]): {
  model: Parameters<typeof spawnSubagent>[0]['model']
  requests: unknown[]
} {
  const requests: unknown[] = []
  let call = 0
  const model = {
    id: 'test/model',
    provider: 'test',
    config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
    stream(options: unknown) {
      const chunks = turns[Math.min(call, turns.length - 1)] ?? []
      call += 1
      requests.push(options)
      return (async function* () {
        for (const chunk of chunks as AgentChunk[]) yield chunk
      })()
    },
  }
  return { model, requests }
}

const text = (delta: string): AgentChunk => ({ type: 'text-delta', delta })
const finish = (): AgentChunk => ({ type: 'finish', reason: 'stop' as const })

describe('built-in subagents (Phase 95)', () => {
  it('explore is read-only: the allowlist excludes write/edit/bash', () => {
    const agent = exploreAgent()
    expect(agent.name).toBe('explore')
    for (const forbidden of ['write', 'edit', 'bash']) {
      expect(agent.tools).not.toContain(forbidden)
    }
    expect(agent.tools).toContain('read')
    expect(agent.tools).toContain('glob')
    expect(agent.tools).toContain('grep')
    expect(agent.systemPrompt.length).toBeGreaterThan(40)
  })

  it('plan is read-only: no mutating tools', () => {
    const agent = planAgent()
    expect(agent.name).toBe('plan')
    for (const forbidden of ['write', 'edit', 'bash']) {
      expect(agent.tools).not.toContain(forbidden)
    }
    expect(agent.systemPrompt.length).toBeGreaterThan(40)
  })

  it('general has full tool access (no allowlist restriction)', () => {
    const agent = generalAgent()
    expect(agent.name).toBe('general')
    const options = definitionToSpawnOptions(
      agent,
      { tools: REGISTRY, model: scriptedModel([[finish()]]).model },
      { task: 't' },
    )
    expect(options.allowedTools).toBeUndefined()
    expect(options.tools).toHaveLength(REGISTRY.length)
  })

  it('narrowed options for explore only offer read-only tools from the registry', () => {
    const options: SpawnSubagentOptions = definitionToSpawnOptions(
      exploreAgent(),
      { tools: REGISTRY, model: scriptedModel([[finish()]]).model },
      { task: 'find auth code' },
    )
    const names = (options.tools ?? []).map((t) => t.name)
    expect(names).toEqual(['read', 'glob', 'grep'])
    expect(options.allowedTools).toEqual(['read', 'glob', 'grep'])
  })
})

describe('built-in subagents spawn end-to-end (Phase 95)', () => {
  for (const [name, build] of [
    ['explore', exploreAgent],
    ['plan', planAgent],
    ['general', generalAgent],
  ] as const) {
    it(`spawns the ${name} subagent and returns its summary`, async () => {
      const { model, requests } = scriptedModel([[text(`${name} finished.`), finish()]])
      const options = definitionToSpawnOptions(
        build(),
        { tools: REGISTRY, model },
        { task: `Run as ${name}.` },
      )
      const result = await spawnSubagent(options)
      expect(result.summary).toBe(`${name} finished.`)
      expect(result.stopReason).toBe('complete')
      expect(requests.length).toBeGreaterThanOrEqual(1)
    })
  }
})
