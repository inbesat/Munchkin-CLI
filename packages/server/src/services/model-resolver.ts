import type { AgentModel } from '@forge/core'
import { ForgeError } from '@forge/core'
import {
  createAnthropicPresetModel,
  createOpenAIPresetModel,
  createGooglePresetModel,
  createOpenAICompatibleModel,
} from '@forge/ai'
import { ErrorCode } from '@forge/core'

/**
 * Resolves a model identifier to a runnable {@link AgentModel}.
 *
 * The server never constructs provider adapters directly — it delegates to this
 * resolver so the model catalog stays the single source of truth and so tests
 * can inject a mock resolver without real API keys.
 */
export type ModelResolver = (modelId: string) => Promise<AgentModel>

export interface ModelResolverOptions {
  anthropicApiKey?: string
  openaiApiKey?: string
  googleApiKey?: string
  forgeFreeApiKey?: string
  forgeFreeBaseUrl?: string
}

const KNOWN_PROVIDERS: Record<string, string[]> = {
  anthropic: ['claude-opus-4', 'claude-sonnet-4-6', 'claude-sonnet-4', 'claude-haiku-3-5'],
  openai: ['gpt-4o', 'gpt-4.1', 'o3', 'o4-mini', 'gpt-4o-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
}

function guessProvider(modelId: string): string {
  const id = modelId.toLowerCase()
  if (id.includes('claude')) return 'anthropic'
  if (id.startsWith('gpt') || id.startsWith('o3') || id.startsWith('o4')) return 'openai'
  if (id.includes('gemini')) return 'google'
  if (id.startsWith('forge') || id.includes('free')) return 'forge-free'
  return 'openai'
}

function requireKey(provider: string, key: string | undefined, env: string): string {
  const value = key ?? process.env[env]
  if (!value) {
    throw new ForgeError(
      ErrorCode.PROVIDER_AUTH_FAILED,
      `${env} is not configured; cannot resolve a ${provider} model`,
      { severity: 'error' },
    )
  }
  return value
}

function assertModel(model: unknown, provider: string, name: string): AgentModel {
  if (!model) {
    throw new ForgeError(ErrorCode.PROVIDER_INVALID_MODEL, `Unknown ${provider} model: ${name}`)
  }
  return model as AgentModel
}

/**
 * Default resolver: maps `provider/name` (or a bare `name`, guessing the
 * provider) to a preset model built from the AI package's preset factories.
 */
export function createModelResolver(options: ModelResolverOptions = {}): ModelResolver {
  return async (modelId: string): Promise<AgentModel> => {
    const segments = modelId.split('/')
    const provider = (segments.length > 1 ? segments[0] : guessProvider(modelId)).toLowerCase()
    const name = segments.length > 1 ? segments.slice(1).join('/') : modelId

    switch (provider) {
      case 'anthropic': {
        const key = requireKey('anthropic', options.anthropicApiKey, 'ANTHROPIC_API_KEY')
        return assertModel(createAnthropicPresetModel(name, key), 'anthropic', name)
      }
      case 'openai': {
        const key = requireKey('openai', options.openaiApiKey, 'OPENAI_API_KEY')
        return assertModel(createOpenAIPresetModel(name, key), 'openai', name)
      }
      case 'google': {
        const key = requireKey('google', options.googleApiKey, 'GOOGLE_API_KEY')
        return assertModel(createGooglePresetModel(name, key), 'google', name)
      }
      case 'forge-free':
      case 'forge': {
        const key = options.forgeFreeApiKey ?? process.env.FORGE_FREE_API_KEY ?? ''
        const baseUrl =
          options.forgeFreeBaseUrl ?? process.env.FORGE_FREE_BASE_URL ?? 'https://gateway.forge.dev/v1'
        const model = createOpenAICompatibleModel({
          provider: 'forge-free',
          name,
          baseUrl,
          apiKey: key,
          config: {
            id: `forge-free/${name}`,
            provider: 'forge-free',
            name,
            displayName: name,
            capabilities: {
              text: true,
              thinking: false,
              toolCalls: true,
              structuredOutput: false,
              vision: false,
              pdf: false,
              maxTokens: 8_192,
              contextWindow: 200_000,
            },
            cost: { inputPerToken: 0, outputPerToken: 0 },
          },
        })
        return assertModel(model, 'forge-free', name)
      }
      default:
        throw new ForgeError(ErrorCode.PROVIDER_NOT_FOUND, `Unknown provider: ${provider}`)
    }
  }
}

export { KNOWN_PROVIDERS }
