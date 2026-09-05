export {
  syncCatalog,
  syncCatalogToMap,
  mergeWithLocal,
  filterModels,
  getModelStats,
} from './sync'

export type { SyncedModel, CatalogSyncOptions } from './sync'

import { type ModelCatalog, createModelCatalog } from '../model/catalog'
import type { ModelConfig } from '../model/types'
import { type CatalogSyncOptions, type SyncedModel, mergeWithLocal, syncCatalog } from './sync'

export interface CatalogManager {
  readonly syncAndLoad: (options?: CatalogSyncOptions) => Promise<ModelCatalog>
  readonly getCatalog: () => ModelCatalog
  readonly getSyncedModels: () => readonly SyncedModel[]
  readonly searchModels: (query: string) => readonly ModelConfig[]
}

export function createCatalogManager(localModels: readonly ModelConfig[] = []): CatalogManager {
  let catalog = createModelCatalog()
  let syncedModels: readonly SyncedModel[] = []
  let allModels: readonly ModelConfig[] = localModels

  for (const model of allModels) {
    catalog.register({
      config: model,
      factory: () => {
        throw new Error(`No factory registered for ${model.id}`)
      },
    })
  }

  return {
    syncAndLoad: async (options?: CatalogSyncOptions): Promise<ModelCatalog> => {
      syncedModels = await syncCatalog(options)
      allModels = mergeWithLocal(syncedModels, localModels)

      catalog = createModelCatalog()
      for (const model of allModels) {
        catalog.register({
          config: model,
          factory: () => {
            throw new Error(`No factory registered for ${model.id}`)
          },
        })
      }

      return catalog
    },

    getCatalog: (): ModelCatalog => catalog,

    getSyncedModels: (): readonly SyncedModel[] => syncedModels,

    searchModels: (query: string): readonly ModelConfig[] => {
      const lowerQuery = query.toLowerCase()
      return allModels.filter(
        (model) =>
          model.displayName.toLowerCase().includes(lowerQuery) ||
          model.name.toLowerCase().includes(lowerQuery) ||
          model.provider.toLowerCase().includes(lowerQuery),
      )
    },
  }
}

export { createModelCatalog } from '../model/catalog'
export type { ModelCatalog } from '../model/catalog'
