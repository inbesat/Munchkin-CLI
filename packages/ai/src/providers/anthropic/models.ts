import type { Model, ModelCapabilities, ModelConfig, ModelCostConfig } from '../../model/types'
import { type AnthropicConfig, createAnthropicModel } from './adapter'

export interface AnthropicModelPreset {
  readonly name: string
  readonly displayName: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly thinking?: boolean
  readonly cost: ModelCostConfig
}

export const ANTHROPIC_MODELS: readonly AnthropicModelPreset[] = [
  {
    name: 'claude-opus-4-20250514',
    displayName: 'Claude Opus',
    contextWindow: 200000,
    maxTokens: 32000,
    thinking: true,
    cost: {
      inputPerToken: 0.000015,
      outputPerToken: 0.000075,
      cacheReadPerToken: 0.0000015,
      cacheWritePerToken: 0.00001875,
    },
  },
  {
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet',
    contextWindow: 200000,
    maxTokens: 64000,
    thinking: true,
    cost: {
      inputPerToken: 0.000003,
      outputPerToken: 0.000015,
      cacheReadPerToken: 0.0000003,
      cacheWritePerToken: 0.00000375,
    },
  },
  {
    name: 'claude-haiku-3-5-20241022',
    displayName: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    maxTokens: 8192,
    cost: {
      inputPerToken: 0.0000008,
      outputPerToken: 0.000004,
      cacheReadPerToken: 0.00000008,
      cacheWritePerToken: 0.000001,
    },
  },
]

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  text: true,
  thinking: false,
  toolCalls: true,
  structuredOutput: false,
  vision: true,
  pdf: false,
  maxTokens: 8192,
  contextWindow: 200000,
}

export function createAnthropicPresetModel(modelName: string, apiKey: string): Model | undefined {
  const preset = ANTHROPIC_MODELS.find((m) => m.name === modelName)
  if (!preset) return undefined

  const capabilities: ModelCapabilities = {
    ...DEFAULT_CAPABILITIES,
    maxTokens: preset.maxTokens,
    contextWindow: preset.contextWindow,
    thinking: preset.thinking ?? false,
  }

  const modelConfig: ModelConfig = {
    id: `anthropic/${preset.name}`,
    provider: 'anthropic',
    name: preset.name,
    displayName: preset.displayName,
    capabilities,
    cost: preset.cost,
    defaultMaxTokens: preset.maxTokens,
  }

  const anthropicConfig: AnthropicConfig = {
    provider: 'anthropic',
    name: preset.name,
    apiKey,
    config: modelConfig,
  }

  return createAnthropicModel(anthropicConfig)
}
