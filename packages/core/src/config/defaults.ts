import type { ForgeConfig } from './schema'

export const DEFAULT_CONFIG: ForgeConfig = {
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    thinkingLevel: 'medium',
    temperature: 1,
  },
  providers: {},
  permissions: {
    mode: 'ask',
    rules: [],
  },
  context: {
    maxTokens: 200000,
    compactionThreshold: 0.8,
    keepRecentMessages: 10,
  },
  agent: {
    maxIterations: 50,
    maxSubagents: 5,
    defaultPermissionMode: 'ask',
  },
  mcp: {},
  hooks: [],
  plugins: [],
  skills: [],
  sandbox: {
    provider: 'none',
    network: true,
    allowedHosts: [],
    readOnly: false,
  },
  theme: {
    name: 'dark',
  },
  telemetry: {
    enabled: false,
  },
  server: {
    host: '127.0.0.1',
    port: 3845,
  },
}

/**
 * Deep merge two config objects. `override` takes precedence over `base`.
 * Arrays are replaced, not concatenated. Undefined values in `override`
 * are ignored (they don't null out base values).
 */
export function mergeConfigs(
  base: Partial<ForgeConfig>,
  override: Partial<ForgeConfig>,
): Partial<ForgeConfig> {
  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeConfigs(result[key] as Partial<ForgeConfig>, value as Partial<ForgeConfig>)
    } else {
      result[key] = value
    }
  }

  return result as Partial<ForgeConfig>
}
