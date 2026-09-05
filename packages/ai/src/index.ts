export const VERSION = '0.1.0'

// ── Subscription OAuth auth (Phase 24) ────────────────────────────
export * from './auth'

// ── Retry / Error normalization (Phase 25) ────────────────────────
export * from './retry'

// ── Fallback chains & model routing (Phase 26) ────────────────────
export * from './routing'

// ── Prompt/cache cost accounting (Phase 27) ───────────────────────
export * from './cache'

// ── Cost tracking engine + budgets (Phase 28) ─────────────────────
export * from './cost'

export type {
  Model,
  ModelCapabilities,
  ModelConfig,
  ModelCostConfig,
  TokenUsage,
  ToolCall,
  ToolResult,
  ToolDefinition,
  FinishReason,
  ModelMessage,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
} from './model/types'

export type { ModelCatalog, ModelCatalogEntry } from './model/catalog'
export { createModelCatalog } from './model/catalog'

export { createOpenAICompatibleModel } from './providers/openai-compatible/adapter'
export type { OpenAICompatibleConfig } from './providers/openai-compatible/adapter'
export {
  PROVIDER_PRESETS,
  createPresetModel,
  listPresetModels,
  DEFAULT_CAPABILITIES,
} from './providers/openai-compatible/models'
export type { ProviderPreset, ProviderModelPreset } from './providers/openai-compatible/models'
export { discoverModels } from './providers/openai-compatible/discovery'
export type { DiscoveredModel } from './providers/openai-compatible/discovery'

export { createGoogleModel } from './providers/google/adapter'
export type { GoogleConfig } from './providers/google/adapter'
export { GOOGLE_MODELS, createGooglePresetModel } from './providers/google/models'
export type { GoogleModelPreset } from './providers/google/models'

export { createAnthropicModel } from './providers/anthropic/adapter'
export type { AnthropicConfig } from './providers/anthropic/adapter'
export { ANTHROPIC_MODELS, createAnthropicPresetModel } from './providers/anthropic/models'
export type { AnthropicModelPreset } from './providers/anthropic/models'

export { createOpenAIModel } from './providers/openai/adapter'
export type { OpenAIConfig } from './providers/openai/adapter'
export { OPENAI_MODELS, createOpenAIPresetModel, listOpenAIModels } from './providers/openai/models'
export type { OpenAIModelPreset } from './providers/openai/models'

export { createBedrockModel } from './providers/bedrock/adapter'
export type { BedrockConfig } from './providers/bedrock/adapter'

export { createVertexModel } from './providers/vertex/adapter'
export type { VertexConfig } from './providers/vertex/adapter'

export { createAzureModel } from './providers/azure/adapter'
export type { AzureConfig } from './providers/azure/adapter'

export {
  syncCatalog,
  syncCatalogToMap,
  mergeWithLocal,
  filterModels,
  getModelStats,
  createCatalogManager,
  createModelCatalog as createModelCatalogFromSync,
} from './catalog'
export type { SyncedModel, CatalogSyncOptions, CatalogManager } from './catalog'
