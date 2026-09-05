import { describe, expect, it } from 'bun:test'
import { DEFAULT_CONFIG, mergeConfigs } from './defaults'
import {
  ForgeConfig,
  HookConfig,
  McpServerConfig,
  ModelConfig,
  PermissionMode,
  PermissionRule,
  PluginConfig,
  SandboxConfig,
} from './schema'

describe('ForgeConfig schema', () => {
  it('accepts valid minimal config', () => {
    const result = ForgeConfig.safeParse({
      model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects config with missing model', () => {
    const result = ForgeConfig.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid provider name', () => {
    const result = ForgeConfig.safeParse({
      model: { provider: 'invalid', model: 'test' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative maxTokens', () => {
    const result = ForgeConfig.safeParse({
      model: { provider: 'anthropic', model: 'test', maxTokens: -1 },
    })
    expect(result.success).toBe(false)
  })

  it('applies defaults correctly', () => {
    const result = ForgeConfig.safeParse({
      model: { provider: 'anthropic', model: 'test' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.model.maxTokens).toBe(8192)
      expect(result.data.permissions.mode).toBe('ask')
      expect(result.data.context.maxTokens).toBe(200000)
      expect(result.data.agent.maxIterations).toBe(50)
      expect(result.data.sandbox.provider).toBe('none')
      expect(result.data.theme.name).toBe('dark')
      expect(result.data.server.port).toBe(3845)
    }
  })
})

describe('PermissionMode', () => {
  it('accepts all valid modes', () => {
    for (const mode of ['ask', 'allow', 'deny', 'auto', 'plan', 'bypass']) {
      expect(PermissionMode.safeParse(mode).success).toBe(true)
    }
  })

  it('rejects invalid mode', () => {
    expect(PermissionMode.safeParse('invalid').success).toBe(false)
  })
})

describe('PermissionRule', () => {
  it('accepts valid rule', () => {
    const result = PermissionRule.safeParse({
      tool: 'bash',
      mode: 'allow',
      pattern: 'ls.*',
    })
    expect(result.success).toBe(true)
  })

  it('requires tool and mode', () => {
    const result = PermissionRule.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('ModelConfig', () => {
  it('accepts all valid providers', () => {
    for (const provider of ['anthropic', 'openai', 'google', 'bedrock', 'vertex', 'deepseek']) {
      const result = ModelConfig.safeParse({ provider, model: 'test' })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid thinkingLevel', () => {
    const result = ModelConfig.safeParse({
      provider: 'anthropic',
      model: 'test',
      thinkingLevel: 'extreme',
    })
    expect(result.success).toBe(false)
  })
})

describe('McpServerConfig', () => {
  it('accepts valid config', () => {
    const result = McpServerConfig.safeParse({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      env: { API_KEY: 'test' },
    })
    expect(result.success).toBe(true)
  })

  it('requires command', () => {
    const result = McpServerConfig.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('HookConfig', () => {
  it('accepts valid hook', () => {
    const result = HookConfig.safeParse({
      event: 'tool:call',
      command: "echo 'tool called'",
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid event', () => {
    const result = HookConfig.safeParse({
      event: 'invalid:event',
      command: 'echo test',
    })
    expect(result.success).toBe(false)
  })
})

describe('PluginConfig', () => {
  it('accepts npm plugin', () => {
    const result = PluginConfig.safeParse({
      source: 'npm',
      spec: '@forge/plugin-example',
    })
    expect(result.success).toBe(true)
  })

  it('accepts local plugin', () => {
    const result = PluginConfig.safeParse({
      source: 'local',
      spec: './plugins/my-plugin',
    })
    expect(result.success).toBe(true)
  })
})

describe('SandboxConfig', () => {
  it('accepts all valid providers', () => {
    for (const provider of ['none', 'landlock', 'seatbelt', 'acl', 'bubblewrap', 'docker', 'e2b']) {
      const result = SandboxConfig.safeParse({ provider })
      expect(result.success).toBe(true)
    }
  })
})

describe('DEFAULT_CONFIG', () => {
  it('is valid ForgeConfig', () => {
    const result = ForgeConfig.safeParse(DEFAULT_CONFIG)
    expect(result.success).toBe(true)
  })

  it('has sensible model defaults', () => {
    expect(DEFAULT_CONFIG.model.provider).toBe('anthropic')
    expect(DEFAULT_CONFIG.model.maxTokens).toBeGreaterThan(0)
  })

  it('has sensible permission defaults', () => {
    expect(DEFAULT_CONFIG.permissions.mode).toBe('ask')
    expect(DEFAULT_CONFIG.permissions.rules).toEqual([])
  })
})

describe('mergeConfigs', () => {
  it('override takes precedence', () => {
    const base: Partial<ForgeConfig> = {
      model: {
        provider: 'anthropic',
        model: 'test-a',
        maxTokens: 8192,
        thinkingLevel: 'medium',
        temperature: 1,
      },
    }
    const override: Partial<ForgeConfig> = {
      model: {
        provider: 'openai',
        model: 'test-b',
        maxTokens: 4096,
        thinkingLevel: 'none',
        temperature: 0.5,
      },
    }
    const merged = mergeConfigs(base, override)
    expect(merged.model?.provider).toBe('openai')
    expect(merged.model?.maxTokens).toBe(4096)
  })

  it('preserves base values when override is undefined', () => {
    const base: Partial<ForgeConfig> = {
      model: {
        provider: 'anthropic',
        model: 'test',
        maxTokens: 8192,
        thinkingLevel: 'medium',
        temperature: 1,
      },
    }
    const override: Partial<ForgeConfig> = {}
    const merged = mergeConfigs(base, override)
    expect(merged.model?.provider).toBe('anthropic')
  })

  it('deep merges nested objects', () => {
    const base: Partial<ForgeConfig> = {
      server: { host: '127.0.0.1', port: 3845 },
    }
    const override: Partial<ForgeConfig> = {
      server: { host: '0.0.0.0', port: 3845 },
    }
    const merged = mergeConfigs(base, override)
    expect(merged.server?.host).toBe('0.0.0.0')
    expect(merged.server?.port).toBe(3845)
  })
})
