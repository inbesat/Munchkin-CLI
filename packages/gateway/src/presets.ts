import type { Upstream } from './router'

export interface FreeTierPreset {
  id: string
  label: string
  upstream: Upstream
  /** Curated free model ids this upstream actually serves (advertised as-is) */
  models: readonly string[]
  /** Prefix used to advertise the upstream; `openrouter` models get `:free` appended */
  prefix: string
  modelRewrite: 'identity' | 'strip-prefix' | 'append-free'
}

/**
 * Free-tier upstream presets. Model ids here are the stable, publicly documented
 * free endpoints (NVIDIA build.nvidia previews, Groq free tier, Cerebras S1,
 * OpenRouter `:free`). Providers generally require some API key even for free
 * slots — the default `apiKeyEnv` name lets an operator supply it via env.
 */
export const FREE_TIER_PRESETS: readonly FreeTierPreset[] = [
  {
    id: 'nvidia',
    label: 'NVIDIA build.nvidia.com',
    prefix: 'nvidia',
    modelRewrite: 'identity',
    upstream: { baseURL: 'https://integrate.api.nvidia.com/v1', apiKeyEnv: 'NVIDIA_API_KEY' },
    models: [
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      'nvidia/deepseek-r1',
    ],
  },
  {
    id: 'groq',
    label: 'Groq (Free Tier)',
    prefix: 'groq',
    modelRewrite: 'strip-prefix',
    upstream: { baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' },
    models: [
      'groq/llama-3.3-70b-versatile',
      'groq/llama-3.1-8b-instant',
      'groq/llama-3.2-3b-preview',
    ],
  },
  {
    id: 'cerebras',
    label: 'Cerebras (Free Tier)',
    prefix: 'cerebras',
    modelRewrite: 'strip-prefix',
    upstream: { baseURL: 'https://api.cerebras.ai/v1', apiKeyEnv: 'CEREBRAS_API_KEY' },
    models: ['cerebras/llama-3.3-70b', 'cerebras/llama-3.1-8b'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (:free)',
    prefix: 'openrouter',
    modelRewrite: 'append-free',
    upstream: {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      headers: { 'HTTP-Referer': 'https://forge.dev', 'X-Title': 'forge' },
    },
    models: [
      'openrouter/deepseek/deepseek-r1',
      'openrouter/meta-llama/llama-3.3-70b-instruct',
      'openrouter/qwen/qwen2.5-coder-32b-instruct',
    ],
  },
]
