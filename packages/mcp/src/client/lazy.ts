/**
 * Tool-search / lazy tool loading (Phase 120): instead of pushing every MCP
 * tool schema into context at session start, keep a lightweight
 * name+description index, let the agent search it, and materialize only the
 * schemas of the tools actually requested.
 * No-throw: loader failures and unknown names are {ok:false, error} results.
 */

export interface LazyToolEntry {
  /** Lightweight index record - no schema of any kind. */
  name: string
  description: string
}

export interface ToolSchema {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type SchemaLoader = () => Promise<
  { ok: true; tools: readonly ToolSchema[] } | { ok: false; error: string }
>

export interface SearchResult extends LazyToolEntry {
  score: number
}

export interface LazyStats {
  indexSize: number
  loadedSchemas: number
}

export type LazyResult<T> = { ok: true; value: T } | { ok: false; error: string }

function scoreEntry(entry: LazyToolEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return 0
  const name = entry.name.toLowerCase()
  const description = entry.description.toLowerCase()
  let score = 0
  if (name === q) score += 100
  else if (name.startsWith(q)) score += 60
  else if (name.includes(q)) score += 40
  const words = q.split(/\s+/).filter((word) => word.length > 0)
  for (const word of words) {
    if (name.includes(word)) score += 10
    if (description.includes(word)) score += 4
  }
  return score
}

export class LazyToolIndex {
  private readonly loader: SchemaLoader
  private index: LazyToolEntry[] = []
  private readonly loadedSchemas = new Map<string, ToolSchema>()
  private builtAt = 0

  constructor(loader: SchemaLoader) {
    this.loader = loader
  }

  /**
   * Fetch the tool catalog once and index name+description ONLY - full
   * schemas are discarded so they never sit in context.
   */
  async buildIndex(): Promise<LazyResult<{ count: number }>> {
    const fetched = await this.loader()
    if (!fetched.ok) return fetched
    this.index = fetched.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
    }))
    this.builtAt = Date.now()
    return { ok: true, value: { count: this.index.length } }
  }

  /** Rank index entries against the query (deterministic, no LLM call). */
  search(query: string, limit = 10): SearchResult[] {
    const scored = this.index
      .map((entry) => ({ ...entry, score: scoreEntry(entry, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    return scored.slice(0, limit)
  }

  /** Materialize exactly the requested schemas (deduped, order preserved). */
  async loadSchemas(names: readonly string[]): Promise<LazyResult<ToolSchema[]>> {
    const missing = [...new Set(names)].filter(
      (name) => !this.index.some((entry) => entry.name === name),
    )
    if (missing.length > 0) {
      return { ok: false, error: `tools not in index: ${missing.join(', ')}` }
    }
    const notYetLoaded = [...new Set(names)].filter((name) => !this.loadedSchemas.has(name))
    if (notYetLoaded.length === 0) {
      return {
        ok: true,
        value: [...new Set(names)].map((name) => this.loadedSchemas.get(name) as ToolSchema),
      }
    }
    const fetched = await this.loader()
    if (!fetched.ok) return fetched
    const byName = new Map(fetched.tools.map((tool) => [tool.name, tool]))
    for (const name of notYetLoaded) {
      const schema = byName.get(name)
      if (schema === undefined) {
        return { ok: false, error: `server does not expose tool '${name}'` }
      }
      this.loadedSchemas.set(name, schema)
    }
    return {
      ok: true,
      value: [...new Set(names)].map((name) => this.loadedSchemas.get(name) as ToolSchema),
    }
  }

  isLoaded(name: string): boolean {
    return this.loadedSchemas.has(name)
  }

  stats(): LazyStats {
    return { indexSize: this.index.length, loadedSchemas: this.loadedSchemas.size }
  }

  /** Epoch ms of the last successful index build (0 = never). */
  get indexBuiltAt(): number {
    return this.builtAt
  }
}
