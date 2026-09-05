import type { Model, ModelCapabilities, ModelConfig, ModelCostConfig } from '../../model/types'
import { type OpenAIConfig, createOpenAIModel } from './adapter'

export interface OpenAIModelPreset {
  name: string
  displayName: string
  contextWindow: number
  maxTokens: number
  structuredOutput?: boolean
  vision?: boolean
  reasoning?: boolean
  cost: ModelCostConfig
}

export const OPENAI_MODELS: readonly OpenAIModelPreset[] = [
  {
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    maxTokens: 16384,
    structuredOutput: true,
    vision: true,
    cost: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxTokens: 16384,
    structuredOutput: true,
    vision: true,
    cost: { inputPerToken: 0.00000015, outputPerToken: 0.0000006 },
  },
  {
    name: 'gpt-4.1',
    displayName: 'GPT-4.1',
    contextWindow: 1000000,
    maxTokens: 32768,
    structuredOutput: true,
    vision: true,
    cost: { inputPerToken: 0.000002, outputPerToken: 0.000008 },
  },
  {
    name: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    contextWindow: 1000000,
    maxTokens: 32768,
    structuredOutput: true,
    vision: true,
    cost: { inputPerToken: 0.0000004, outputPerToken: 0.0000016 },
  },
  {
    name: 'o3',
    displayName: 'o3',
    contextWindow: 200000,
    maxTokens: 100000,
    reasoning: true,
    cost: { inputPerToken: 0.00001, outputPerToken: 0.00004 },
  },
  {
    name: 'o4-mini',
    displayName: 'o4-mini',
    contextWindow: 200000,
    maxTokens: 100000,
    reasoning: true,
    cost: { inputPerToken: 0.0000011, outputPerToken: 0.0000044 },
  },
]

function makeCapabilities(preset: OpenAIModelPreset): ModelCapabilities {
  return {
    text: true,
    thinking: preset.reasoning ?? false,
    toolCalls: true,
    structuredOutput: preset.structuredOutput ?? false,
    vision: preset.vision ?? false,
    pdf: false,
    maxTokens: preset.maxTokens,
    contextWindow: preset.contextWindow,
  }
}

export function createOpenAIPresetModel(modelName: string, apiKey: string): Model | undefined {
  const preset = OPENAI_MODELS.find((m) => m.name === modelName)
  if (!preset) return undefined

  const capabilities = makeCapabilities(preset)
  const config: ModelConfig = {
    id: `openai/${preset.name}`,
    provider: 'openai',
    name: preset.name,
    displayName: preset.displayName,
    capabilities,
    cost: preset.cost,
    defaultMaxTokens: preset.maxTokens,
    supportsCacheControl: false,
  }

  const openaiConfig: OpenAIConfig = {
    provider: 'openai',
    name: preset.name,
    apiKey,
    config,
  }

  return createOpenAIModel(openaiConfig)
}

export function listOpenAIModels(): readonly OpenAIModelPreset[] {
  return OPENAI_MODELS
}
