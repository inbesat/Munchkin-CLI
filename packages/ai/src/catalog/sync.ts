import type { ModelCapabilities, ModelConfig, ModelCostConfig } from '../model/types'

export interface SyncedModel {
  readonly config: ModelConfig
  readonly provider: string
  readonly modelId: string
}

export interface CatalogSyncOptions {
  readonly apiUrl?: string
  readonly includeProviders?: readonly string[]
  readonly excludeProviders?: readonly string[]
  readonly includeFreeModels?: boolean
}

const DEFAULT_API_URL = 'https://models.dev/api.json'

function convertCost(
  cost:
    | {
        input: number
        output: number
        reasoning?: number
        cache_read?: number
        cache_write?: number
      }
    | undefined,
): ModelCostConfig {
  if (!cost) return { inputPerToken: 0, outputPerToken: 0 }
  return {
    inputPerToken: cost.input / 1_000_000,
    outputPerToken: cost.output / 1_000_000,
  }
}

function convertLimit(
  limit: { context: number; input?: number; output: number } | undefined,
  defaults: { contextWindow: number; maxTokens: number },
): { contextWindow: number; maxTokens: number } {
  if (!limit) return defaults
  return {
    contextWindow: limit.context,
    maxTokens: limit.output,
  }
}

function convertCapabilities(model: {
  reasoning?: boolean
  tool_call?: boolean
  structured_output?: boolean
  modalities?: { input?: string[]; output?: string[] }
}): ModelCapabilities {
  const inputModalities = model.modalities?.input ?? []

  return {
    text: true,
    thinking: model.reasoning ?? false,
    toolCalls: model.tool_call ?? false,
    structuredOutput: model.structured_output ?? false,
    vision: inputModalities.includes('image'),
    pdf: inputModalities.includes('pdf'),
    maxTokens: 4096,
    contextWindow: 128000,
  }
}

function mapProviderName(providerId: string): string {
  const mapping: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    meta: 'meta',
    mistral: 'mistral',
    deepseek: 'deepseek',
    cohere: 'cohere',
    alibaba: 'alibaba',
    xiaomi: 'xiaomi',
    minimax: 'minimax',
    moonshotai: 'moonshot',
    'bytedance-seed': 'bytedance',
    zhipuai: 'zhipu',
    xai: 'xai',
    nvidia: 'nvidia',
    ibm: 'ibm',
    microsoft: 'microsoft',
    stepfun: 'stepfun',
    sakana: 'sakana',
    tencent: 'tencent',
    upstage: 'upstage',
    poolside: 'poolside',
    perplexity: 'perplexity',
    'arcee-ai': 'arcee',
    sarvam: 'sarvam',
    thinkingmachines: 'thinkingmachines',
    deepreinforce: 'deepreinforce',
    sdaia: 'sdaia',
    'swiss-ai': 'swissai',
    trendyol: 'trendyol',
    aisingapore: 'aisingapore',
  }

  return mapping[providerId] ?? providerId
}

export async function syncCatalog(
  options: CatalogSyncOptions = {},
): Promise<readonly SyncedModel[]> {
  const {
    apiUrl = DEFAULT_API_URL,
    includeProviders,
    excludeProviders,
    includeFreeModels = true,
  } = options

  const resp = await fetch(apiUrl)
  if (!resp.ok) {
    throw new Error(`Failed to fetch catalog: ${resp.status} ${resp.statusText}`)
  }

  const data = (await resp.json()) as Record<
    string,
    {
      id: string
      name: string
      models: Record<
        string,
        {
          id: string
          name: string
          cost?: { input: number; output: number }
          limit?: { context: number; output: number }
          reasoning?: boolean
          tool_call?: boolean
          structured_output?: boolean
          modalities?: { input?: string[]; output?: string[] }
          status?: string
        }
      >
    }
  >

  const syncedModels: SyncedModel[] = []

  for (const [providerId, provider] of Object.entries(data)) {
    if (!provider.models) continue

    if (includeProviders && !includeProviders.includes(providerId)) continue
    if (excludeProviders?.includes(providerId)) continue

    const mappedProvider = mapProviderName(providerId)

    for (const [modelId, model] of Object.entries(provider.models)) {
      if (model.status === 'deprecated') continue

      const cost = convertCost(model.cost)
      if (!includeFreeModels && cost && cost.inputPerToken === 0 && cost.outputPerToken === 0)
        continue

      const limit = convertLimit(model.limit, { contextWindow: 128000, maxTokens: 4096 })
      const baseCapabilities = convertCapabilities(model)

      const capabilities: ModelCapabilities = {
        ...baseCapabilities,
        maxTokens: limit.maxTokens,
        contextWindow: limit.contextWindow,
      }

      const config: ModelConfig = {
        id: `${mappedProvider}/${modelId}`,
        provider: mappedProvider,
        name: modelId,
        displayName: model.name,
        capabilities,
        cost,
        defaultMaxTokens: limit.maxTokens,
        supportsCacheControl: false,
      }

      syncedModels.push({
        config,
        provider: mappedProvider,
        modelId,
      })
    }
  }

  return syncedModels
}

export async function syncCatalogToMap(
  options: CatalogSyncOptions = {},
): Promise<Map<string, SyncedModel>> {
  const models = await syncCatalog(options)
  const map = new Map<string, SyncedModel>()

  for (const model of models) {
    map.set(model.config.id, model)
  }

  return map
}

export function mergeWithLocal(
  syncedModels: readonly SyncedModel[],
  localModels: readonly ModelConfig[],
): readonly ModelConfig[] {
  const merged = new Map<string, ModelConfig>()

  for (const model of syncedModels) {
    merged.set(model.config.id, model.config)
  }

  for (const local of localModels) {
    merged.set(local.id, local)
  }

  return Array.from(merged.values())
}

export function filterModels(
  models: readonly ModelConfig[],
  filter: {
    provider?: string
    minContextWindow?: number
    maxCostInput?: number
    requiresToolCalls?: boolean
    requiresVision?: boolean
  },
): readonly ModelConfig[] {
  return models.filter((model) => {
    if (filter.provider && model.provider !== filter.provider) return false
    if (filter.minContextWindow && model.capabilities.contextWindow < filter.minContextWindow)
      return false
    if (filter.maxCostInput && model.cost && model.cost.inputPerToken > filter.maxCostInput)
      return false
    if (filter.requiresToolCalls && !model.capabilities.toolCalls) return false
    if (filter.requiresVision && !model.capabilities.vision) return false
    return true
  })
}

export function getModelStats(models: readonly ModelConfig[]): {
  totalModels: number
  providers: string[]
  freeModels: number
  reasoningModels: number
  visionModels: number
  toolCallModels: number
} {
  const providers = new Set<string>()
  let freeModels = 0
  let reasoningModels = 0
  let visionModels = 0
  let toolCallModels = 0

  for (const model of models) {
    providers.add(model.provider)
    if (model.cost && model.cost.inputPerToken === 0 && model.cost.outputPerToken === 0)
      freeModels++
    if (model.capabilities.thinking) reasoningModels++
    if (model.capabilities.vision) visionModels++
    if (model.capabilities.toolCalls) toolCallModels++
  }

  return {
    totalModels: models.length,
    providers: Array.from(providers),
    freeModels,
    reasoningModels,
    visionModels,
    toolCallModels,
  }
}
