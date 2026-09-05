import type { Model, ModelCapabilities, ModelConfig, ModelCostConfig } from '../../model/types'
import { createOpenAICompatibleModel } from './adapter'

export interface ProviderModelPreset {
  readonly name: string
  readonly displayName: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly cost: ModelCostConfig
  readonly capabilities?: Partial<ModelCapabilities>
}

export interface ProviderPreset {
  readonly name: string
  readonly baseUrl: string
  readonly models: readonly ProviderModelPreset[]
}

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  text: true,
  thinking: false,
  toolCalls: true,
  structuredOutput: true,
  vision: false,
  pdf: false,
  maxTokens: 8192,
  contextWindow: 128000,
}

export const FORGE_FREE_DEFAULT_BASE_URL = 'http://localhost:8787'

/** Base URL of the self-hosted forge-free gateway (Phase 29-32 relay) */
export function forgeFreeBaseUrl(): string {
  return process.env.FORGE_GATEWAY_URL ?? FORGE_FREE_DEFAULT_BASE_URL
}

/** Optional bearer token for the gateway's `token` auth mode */
export function forgeFreeApiKey(): string {
  return process.env.FORGE_GATEWAY_TOKEN ?? ''
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  'forge-free': {
    name: 'forge-free (self-hosted gateway)',
    baseUrl: FORGE_FREE_DEFAULT_BASE_URL,
    models: [
      {
        name: 'nvidia/llama-3.1-nemotron-70b-instruct',
        displayName: 'Nemotron 70B (NVIDIA, free)',
        contextWindow: 131072,
        maxTokens: 16384,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'groq/llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B (Groq, free)',
        contextWindow: 128000,
        maxTokens: 32768,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'groq/llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B (Groq, free)',
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'cerebras/llama-3.3-70b',
        displayName: 'Llama 3.3 70B (Cerebras, free)',
        contextWindow: 131072,
        maxTokens: 16384,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'openrouter/meta-llama/llama-3.3-70b-instruct:free',
        displayName: 'Llama 3.3 70B (OpenRouter, free)',
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'openrouter/mistralai/mistral-7b-instruct:free',
        displayName: 'Mistral 7B (OpenRouter, free)',
        contextWindow: 32768,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
    ],
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      {
        name: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B',
        contextWindow: 128000,
        maxTokens: 32768,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B',
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'mixtral-8x7b-32768',
        displayName: 'Mixtral 8x7B',
        contextWindow: 32768,
        maxTokens: 32768,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'gemma2-9b-it',
        displayName: 'Gemma 2 9B',
        contextWindow: 8192,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      {
        name: 'meta-llama/llama-3.3-70b-instruct:free',
        displayName: 'Llama 3.3 70B (Free)',
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'google/gemma-2-9b-it:free',
        displayName: 'Gemma 2 9B (Free)',
        contextWindow: 8192,
        maxTokens: 4096,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'mistralai/mistral-7b-instruct:free',
        displayName: 'Mistral 7B (Free)',
        contextWindow: 32768,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
    ],
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      {
        name: 'llama3.3',
        displayName: 'Llama 3.3',
        contextWindow: 128000,
        maxTokens: 32768,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'codellama',
        displayName: 'CodeLlama',
        contextWindow: 16384,
        maxTokens: 4096,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'mistral',
        displayName: 'Mistral',
        contextWindow: 32768,
        maxTokens: 8192,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
      {
        name: 'deepseek-coder',
        displayName: 'DeepSeek Coder',
        contextWindow: 16384,
        maxTokens: 4096,
        cost: { inputPerToken: 0, outputPerToken: 0 },
      },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      {
        name: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        contextWindow: 65536,
        maxTokens: 8192,
        cost: { inputPerToken: 0.00000014, outputPerToken: 0.00000028 },
      },
      {
        name: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner',
        contextWindow: 65536,
        maxTokens: 8192,
        cost: { inputPerToken: 0.00000055, outputPerToken: 0.00000219 },
        capabilities: { thinking: true },
      },
    ],
  },
}

export function createPresetModel(
  providerName: string,
  modelName: string,
  apiKey = '',
): Model | undefined {
  const preset = PROVIDER_PRESETS[providerName]
  if (!preset) return undefined

  const modelPreset = preset.models.find((m) => m.name === modelName)
  if (!modelPreset) return undefined

  const capabilities: ModelCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...modelPreset.capabilities,
    maxTokens: modelPreset.maxTokens,
    contextWindow: modelPreset.contextWindow,
  }

  let resolvedApiKey = apiKey
  let resolvedBaseUrl = preset.baseUrl
  if (providerName === 'forge-free') {
    resolvedBaseUrl = forgeFreeBaseUrl()
    if (!resolvedApiKey) resolvedApiKey = forgeFreeApiKey()
  }

  const config: ModelConfig = {
    id: `${providerName}/${modelName}`,
    provider: providerName,
    name: modelName,
    displayName: modelPreset.displayName,
    capabilities,
    cost: modelPreset.cost,
    defaultMaxTokens: modelPreset.maxTokens,
  }

  return createOpenAICompatibleModel({
    provider: providerName,
    name: modelName,
    baseUrl: resolvedBaseUrl,
    apiKey: resolvedApiKey,
    config,
  })
}

export function listPresetModels(providerName: string): readonly ProviderModelPreset[] {
  const preset = PROVIDER_PRESETS[providerName]
  if (!preset) return []
  return preset.models
}
