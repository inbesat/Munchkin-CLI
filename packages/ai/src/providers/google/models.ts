import type { Model, ModelCapabilities, ModelConfig, ModelCostConfig } from '../../model/types'
import { type GoogleConfig, createGoogleModel } from './adapter'

export interface GoogleModelPreset {
  readonly name: string
  readonly displayName: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly thinking?: boolean
  readonly cost: ModelCostConfig
}

export const GOOGLE_MODELS: readonly GoogleModelPreset[] = [
  {
    name: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1000000,
    maxTokens: 65536,
    thinking: true,
    cost: { inputPerToken: 0.00000125, outputPerToken: 0.00001 },
  },
  {
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1000000,
    maxTokens: 65536,
    thinking: true,
    cost: { inputPerToken: 0.00000015, outputPerToken: 0.0000006 },
  },
  {
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    maxTokens: 8192,
    cost: { inputPerToken: 0.0000001, outputPerToken: 0.0000004 },
  },
]

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  text: true,
  thinking: false,
  toolCalls: true,
  structuredOutput: true,
  vision: true,
  pdf: true,
  maxTokens: 8192,
  contextWindow: 128000,
}

export function createGooglePresetModel(modelName: string, apiKey: string): Model | undefined {
  const preset = GOOGLE_MODELS.find((m) => m.name === modelName)
  if (!preset) return undefined

  const capabilities: ModelCapabilities = {
    ...DEFAULT_CAPABILITIES,
    maxTokens: preset.maxTokens,
    contextWindow: preset.contextWindow,
    thinking: preset.thinking ?? false,
  }

  const modelConfig: ModelConfig = {
    id: `google/${preset.name}`,
    provider: 'google',
    name: preset.name,
    displayName: preset.displayName,
    capabilities,
    cost: preset.cost,
    defaultMaxTokens: preset.maxTokens,
  }

  const googleConfig: GoogleConfig = {
    provider: 'google',
    name: preset.name,
    apiKey,
    config: modelConfig,
  }

  return createGoogleModel(googleConfig)
}
