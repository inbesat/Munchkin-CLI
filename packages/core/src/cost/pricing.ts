export interface ModelPricing {
  inputPerToken: number
  outputPerToken: number
  cacheReadPerToken: number
  cacheWritePerToken: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.3 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000,
  },
  'claude-opus-4-20250514': {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.5 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000,
  },
  'claude-3-5-haiku-20241022': {
    inputPerToken: 0.8 / 1_000_000,
    outputPerToken: 4 / 1_000_000,
    cacheReadPerToken: 0.08 / 1_000_000,
    cacheWritePerToken: 1 / 1_000_000,
  },
  'gpt-4o': {
    inputPerToken: 2.5 / 1_000_000,
    outputPerToken: 10 / 1_000_000,
    cacheReadPerToken: 1.25 / 1_000_000,
    cacheWritePerToken: 2.5 / 1_000_000,
  },
  'gpt-4o-mini': {
    inputPerToken: 0.15 / 1_000_000,
    outputPerToken: 0.6 / 1_000_000,
    cacheReadPerToken: 0.075 / 1_000_000,
    cacheWritePerToken: 0.15 / 1_000_000,
  },
  'gemini-2.5-pro': {
    inputPerToken: 1.25 / 1_000_000,
    outputPerToken: 10 / 1_000_000,
    cacheReadPerToken: 0.315 / 1_000_000,
    cacheWritePerToken: 1.25 / 1_000_000,
  },
  'gemini-2.5-flash': {
    inputPerToken: 0.15 / 1_000_000,
    outputPerToken: 0.6 / 1_000_000,
    cacheReadPerToken: 0.0375 / 1_000_000,
    cacheWritePerToken: 0.15 / 1_000_000,
  },
  'deepseek-chat': {
    inputPerToken: 0.14 / 1_000_000,
    outputPerToken: 0.28 / 1_000_000,
    cacheReadPerToken: 0.014 / 1_000_000,
    cacheWritePerToken: 0.14 / 1_000_000,
  },
  'deepseek-reasoner': {
    inputPerToken: 0.55 / 1_000_000,
    outputPerToken: 2.19 / 1_000_000,
    cacheReadPerToken: 0.055 / 1_000_000,
    cacheWritePerToken: 0.55 / 1_000_000,
  },
}

const FALLBACK: ModelPricing = {
  inputPerToken: 3 / 1_000_000,
  outputPerToken: 15 / 1_000_000,
  cacheReadPerToken: 0.3 / 1_000_000,
  cacheWritePerToken: 3.75 / 1_000_000,
}

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const pricing = getModelPricing(model)
  return (
    inputTokens * pricing.inputPerToken +
    outputTokens * pricing.outputPerToken +
    cacheReadTokens * pricing.cacheReadPerToken +
    cacheWriteTokens * pricing.cacheWritePerToken
  )
}
