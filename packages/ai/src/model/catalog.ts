import type { Model, ModelCapabilities, ModelConfig } from './types'

export interface ModelCatalogEntry {
  readonly config: ModelConfig
  readonly factory: () => Model
}

export interface ModelCatalog {
  register(entry: ModelCatalogEntry): void
  getModel(provider: string, model: string): Model | undefined
  getConfig(provider: string, model: string): ModelConfig | undefined
  listModels(provider?: string): readonly ModelConfig[]
  searchModels(capabilities: Partial<ModelCapabilities>): readonly ModelConfig[]
  getProviders(): readonly string[]
  hasModel(provider: string, model: string): boolean
}

export function createModelCatalog(): ModelCatalog {
  const entries = new Map<string, ModelCatalogEntry>()
  const byProvider = new Map<string, Map<string, ModelCatalogEntry>>()

  function key(provider: string, model: string): string {
    return `${provider}/${model}`
  }

  return {
    register(entry: ModelCatalogEntry): void {
      const k = key(entry.config.provider, entry.config.name)
      entries.set(k, entry)

      let providerMap = byProvider.get(entry.config.provider)
      if (!providerMap) {
        providerMap = new Map()
        byProvider.set(entry.config.provider, providerMap)
      }
      providerMap.set(entry.config.name, entry)
    },

    getModel(provider: string, model: string): Model | undefined {
      const entry = entries.get(key(provider, model))
      return entry?.factory()
    },

    getConfig(provider: string, model: string): ModelConfig | undefined {
      return entries.get(key(provider, model))?.config
    },

    listModels(provider?: string): readonly ModelConfig[] {
      if (provider) {
        const providerMap = byProvider.get(provider)
        if (!providerMap) return []
        return Array.from(providerMap.values()).map((e) => e.config)
      }
      return Array.from(entries.values()).map((e) => e.config)
    },

    searchModels(capabilities: Partial<ModelCapabilities>): readonly ModelConfig[] {
      return Array.from(entries.values())
        .map((e) => e.config)
        .filter((config) => {
          for (const [k, v] of Object.entries(capabilities)) {
            if (v === undefined) continue
            const capValue = config.capabilities[k as keyof ModelCapabilities]
            if (capValue !== v) return false
          }
          return true
        })
    },

    getProviders(): readonly string[] {
      return Array.from(byProvider.keys())
    },

    hasModel(provider: string, model: string): boolean {
      return entries.has(key(provider, model))
    },
  }
}
