import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AgentModel, AgentTool } from '../agent/types'
import { type SpawnSubagentOptions, spawnSubagent } from './spawn'
/**
 * Agent definition files (Phase 94): `.forge/agents/*.md` files with YAML
 * frontmatter (name, description, tools, model, skills, isolation) and a
 * markdown body that becomes the subagent system prompt.
 */

export interface AgentDefinition {
  path: string
  name: string
  description: string
  /** Tool allowlist names (Phase-93 `allowedTools`). */
  tools: string[]
  /** Optional model id override; resolution is the caller's concern. */
  model?: string
  /** Skill names reserved for the skills subsystem (loaded as strings only). */
  skills: string[]
  /** 'inherit' (default) or 'worktree' — recorded; enforcement lands with Phase 96. */
  isolation: 'inherit' | 'worktree'
  /** Markdown body: the subagent's system prompt. */
  systemPrompt: string
}

export interface AgentDefinitionError {
  path: string
  reason: string
}

export interface LoadedAgentDefinitions {
  definitions: AgentDefinition[]
  errors: AgentDefinitionError[]
}

export interface LoadAgentDefinitionsOptions {
  /** Directory holding `*.md` agent definitions, relative to `projectRoot`. Default: `.forge/agents`. */
  dir?: string
}

const AGENTS_SUBDIR = join('.forge', 'agents')

interface ParsedFrontmatter {
  scalars: Record<string, string>
  lists: Record<string, string[]>
  body: string
}

/** Parse the small frontmatter subset used by definition files (no yaml dep). */
function parseDefinition(raw: string): ParsedFrontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return null
  const [, frontmatter, body] = match
  const scalars: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  let currentList: string | null = null
  for (const line of frontmatter.split(/\r?\n/)) {
    const item = /^\s*-\s+(.+)$/.exec(line)
    if (item && currentList) {
      lists[currentList].push(item[1].trim())
      continue
    }
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (!entry) continue
    const [, key, rawValue] = entry
    const inline = rawValue.trim()
    if (inline === '') {
      currentList = key
      lists[key] = []
      continue
    }
    currentList = null
    const inlineList = /^\[(.*)\]$/.exec(inline)
    if (inlineList) {
      lists[key] = inlineList[1]
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    } else {
      scalars[key] = inline.replace(/^["']|["']$/g, '')
    }
  }
  return { scalars, lists, body: body.trim() }
}

/** Load agent definitions from `<projectRoot>/.forge/agents/*.md`, sorted by name. */
export function loadAgentDefinitions(
  projectRoot: string,
  options: LoadAgentDefinitionsOptions = {},
): LoadedAgentDefinitions {
  const errors: AgentDefinitionError[] = []
  const dir = resolve(projectRoot, options.dir ?? AGENTS_SUBDIR)
  if (!existsSync(dir)) return { definitions: [], errors }

  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => e.name)
  } catch (error) {
    errors.push({ path: dir, reason: error instanceof Error ? error.message : 'unreadable' })
    return { definitions: [], errors }
  }

  const definitions: AgentDefinition[] = []
  for (const name of entries.filter((f) => f.endsWith('.md')).sort()) {
    const path = join(dir, name)
    try {
      const parsed = parseDefinition(readFileSync(path, 'utf-8'))
      if (!parsed) {
        errors.push({ path, reason: 'missing frontmatter fences' })
        continue
      }
      const agentName = parsed.scalars.name
      const description = parsed.scalars.description
      if (!agentName) {
        errors.push({ path, reason: 'frontmatter is missing `name`' })
        continue
      }
      const isolation = parsed.scalars.isolation === 'worktree' ? 'worktree' : 'inherit'
      definitions.push({
        path,
        name: agentName,
        description: description ?? '',
        tools: parsed.lists.tools ?? [],
        model: parsed.scalars.model,
        skills: parsed.lists.skills ?? [],
        isolation,
        systemPrompt: parsed.body,
      })
    } catch (error) {
      errors.push({ path, reason: error instanceof Error ? error.message : 'unreadable' })
    }
  }

  return { definitions, errors }
}

export interface SpawnResolution {
  /** Model override to use when the definition names one. */
  model?: AgentModel
  /** Candidate tool catalog to allowlist from. */
  tools?: readonly AgentTool[]
}

/** Map a definition onto Phase-93 spawn options (allowlist + model override). */
export function definitionToSpawnOptions(
  definition: AgentDefinition,
  resolution: SpawnResolution & { model: AgentModel },
  invocation: { task: string } = { task: '' },
): SpawnSubagentOptions {
  // The caller resolves `definition.model` to an AgentModel instance before
  // handing it here (model catalogs are a provider-layer concern).
  const model = resolution.model
  const candidateTools = resolution.tools ?? []
  const tools = candidateTools.filter((tool) => definition.tools.includes(tool.name))
  return {
    model,
    task: invocation.task,
    systemPrompt:
      definition.systemPrompt ||
      `You are the ${definition.name} subagent. ${definition.description}`.trim(),
    tools: definition.tools.length > 0 ? tools : candidateTools,
    allowedTools: definition.tools.length > 0 ? definition.tools : undefined,
  }
}

/** Convenience: load definitions and immediately spawn one by name. */
export async function spawnDefinedAgent(
  projectRoot: string,
  name: string,
  resolution: SpawnResolution & { model: AgentModel },
  task: string,
): Promise<ReturnType<typeof spawnSubagent>> {
  const { definitions } = loadAgentDefinitions(projectRoot)
  const definition = definitions.find((d) => d.name === name)
  const resolved = definition ?? {
    path: join(AGENTS_SUBDIR, `${name}.md`),
    name,
    description: '',
    tools: [] as string[],
    skills: [] as string[],
    isolation: 'inherit' as const,
    systemPrompt: '',
  }
  return spawnSubagent(definitionToSpawnOptions(resolved, resolution, { task }))
}
