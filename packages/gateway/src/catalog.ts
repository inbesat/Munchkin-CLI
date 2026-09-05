import { getModelStats, syncCatalogToMap } from '@forge/ai'

export interface FreeModelRecord {
  id: string
  provider: string
  contextWindow: number
  maxTokens: number
  toolCalls: boolean
  thinking: boolean
  vision: boolean
}

export interface FreeCatalogOptions {
  readonly includeProviders?: readonly string[]
}

const FREE_PROVIDERS = ['nvidia', 'groq', 'cerebras', 'openrouter', 'zhipu', 'moonshot', 'deepseek']

/**
 * Pull models.dev and surface every model priced at $0/$0, restricted to a
 * sensible free-provider allowlist so the list stays curated. This is the
 * seed/backstop for Phase 30's allowlist — the definitive advertisement list
 * lives in `presets.ts`.
 */
export async function buildFreeCatalog(
  options: FreeCatalogOptions = {},
): Promise<readonly FreeModelRecord[]> {
  const map = await syncCatalogToMap({
    includeFreeModels: true,
    excludeProviders: FREE_PROVIDERS.filter(
      (p) => !(options.includeProviders ?? FREE_PROVIDERS).includes(p),
    ),
  })

  const records: FreeModelRecord[] = []
  for (const synced of map.values()) {
    const c = synced.config
    if (!c.cost || c.cost.inputPerToken !== 0 || c.cost.outputPerToken !== 0) continue
    records.push({
      id: c.id,
      provider: c.provider,
      contextWindow: c.capabilities.contextWindow,
      maxTokens: c.capabilities.maxTokens,
      toolCalls: c.capabilities.toolCalls,
      thinking: c.capabilities.thinking,
      vision: c.capabilities.vision,
    })
  }

  return records.sort((a, b) => a.id.localeCompare(b.id))
}

export interface FreeCatalogStats {
  totalFreeModels: number
  providers: string[]
  reasoningModels: number
  toolCallModels: number
}

export function summarizeFreeCatalog(models: readonly FreeModelRecord[]): FreeCatalogStats {
  const stats = getModelStats(
    models.map((m) => ({
      id: m.id,
      name: m.id,
      displayName: m.id,
      provider: m.provider,
      capabilities: {
        text: true,
        thinking: m.thinking,
        toolCalls: m.toolCalls,
        structuredOutput: false,
        vision: m.vision,
        pdf: false,
        maxTokens: m.maxTokens,
        contextWindow: m.contextWindow,
      },
      cost: { inputPerToken: 0, outputPerToken: 0 },
      defaultMaxTokens: m.maxTokens,
      supportsCacheControl: false,
    })),
  )
  return {
    totalFreeModels: stats.totalModels,
    providers: stats.providers,
    reasoningModels: stats.reasoningModels,
    toolCallModels: stats.toolCallModels,
  }
}
