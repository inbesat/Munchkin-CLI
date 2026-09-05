import { z } from 'zod'

// ── Permission Rules ──────────────────────────────────────────────

export const PermissionMode = z.enum(['ask', 'allow', 'deny', 'auto', 'plan', 'bypass'])
export type PermissionMode = z.infer<typeof PermissionMode>

export const PermissionRule = z.object({
  tool: z.string().describe("Tool name or pattern (e.g. 'bash', 'edit', '*')"),
  mode: PermissionMode.describe('Permission mode for this tool'),
  pattern: z.string().optional().describe('Optional regex pattern to match against tool input'),
  reason: z.string().optional().describe('Human-readable reason for this rule'),
})
export type PermissionRule = z.infer<typeof PermissionRule>

// ── Provider Config ───────────────────────────────────────────────

export const ProviderConfig = z.object({
  apiKey: z.string().optional().describe('API key (can use env var reference: $ANTHROPIC_API_KEY)'),
  baseUrl: z.string().url().optional().describe('Custom API base URL'),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(3)
    .describe('Max retry attempts for failed requests'),
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(30000)
    .describe('Request timeout in milliseconds'),
})
export type ProviderConfig = z.infer<typeof ProviderConfig>

// ── Model Config ──────────────────────────────────────────────────

export const ModelConfig = z.object({
  provider: z
    .enum(['anthropic', 'openai', 'google', 'bedrock', 'vertex', 'deepseek'])
    .describe('AI provider'),
  model: z.string().min(1).describe("Model identifier (e.g. 'claude-sonnet-4-20250514')"),
  maxTokens: z.number().int().min(256).max(1000000).default(8192).describe('Maximum output tokens'),
  thinkingLevel: z
    .enum(['none', 'low', 'medium', 'high'])
    .default('medium')
    .describe('Thinking/reasoning level'),
  temperature: z.number().min(0).max(2).default(1).describe('Sampling temperature'),
})
export type ModelConfig = z.infer<typeof ModelConfig>

// ── MCP Server Config ─────────────────────────────────────────────

export const McpServerConfig = z.object({
  command: z.string().min(1).describe('Command to launch the MCP server'),
  args: z.array(z.string()).default([]).describe('Command arguments'),
  env: z.record(z.string(), z.string()).default({}).describe('Environment variables'),
  cwd: z.string().optional().describe('Working directory for the server process'),
  enabled: z.boolean().default(true).describe('Whether this server is active'),
})
export type McpServerConfig = z.infer<typeof McpServerConfig>

// ── Hook Config ───────────────────────────────────────────────────

export const HookEvent = z.enum([
  'session:start',
  'session:end',
  'prompt:received',
  'prompt:processed',
  'tool:call',
  'tool:result',
  'tool:error',
  'permission:requested',
  'permission:granted',
  'permission:denied',
  'llm:request',
  'llm:response',
  'llm:stream:delta',
  'llm:stream:end',
  'compaction:before',
  'compaction:after',
  'checkpoint:created',
  'subagent:spawn',
  'subagent:result',
  'error:occurred',
  'update:available',
])
export type HookEvent = z.infer<typeof HookEvent>

export const HookConfig = z.object({
  event: HookEvent.describe('Event to listen for'),
  command: z.string().optional().describe('Shell command to execute on event'),
  script: z.string().optional().describe('Path to script file to execute'),
  matcher: z.string().optional().describe('Regex pattern to filter events'),
  timeout: z
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(5000)
    .describe('Hook execution timeout in ms'),
})
export type HookConfig = z.infer<typeof HookConfig>

// ── Plugin Config ─────────────────────────────────────────────────

export const PluginSource = z.enum(['npm', 'local', 'git'])
export const PluginConfig = z.object({
  source: PluginSource.describe('Where to load the plugin from'),
  spec: z.string().min(1).describe('Package name, path, or git URL'),
  enabled: z.boolean().default(true).describe('Whether this plugin is active'),
  config: z.record(z.string(), z.unknown()).default({}).describe('Plugin-specific configuration'),
})
export type PluginConfig = z.infer<typeof PluginConfig>

// ── Skill Config ──────────────────────────────────────────────────

export const SkillConfig = z.object({
  name: z.string().min(1).describe('Skill identifier'),
  enabled: z.boolean().default(true).describe('Whether this skill is active'),
  autoTrigger: z
    .boolean()
    .default(false)
    .describe('Automatically activate when matching context is detected'),
  path: z.string().optional().describe('Path to SKILL.md file'),
})
export type SkillConfig = z.infer<typeof SkillConfig>

// ── Sandbox Config ────────────────────────────────────────────────

export const SandboxProvider = z.enum([
  'none',
  'landlock',
  'seatbelt',
  'acl',
  'bubblewrap',
  'docker',
  'e2b',
])
export const SandboxConfig = z.object({
  provider: SandboxProvider.default('none').describe('Sandbox provider to use'),
  network: z.boolean().default(true).describe('Allow network access inside sandbox'),
  allowedHosts: z.array(z.string()).default([]).describe('Hostnames allowed when network=true'),
  readOnly: z.boolean().default(false).describe('Mount project directory as read-only'),
})
export type SandboxConfig = z.infer<typeof SandboxConfig>

// ── Theme Config ──────────────────────────────────────────────────

export const ThemeConfig = z.object({
  name: z.enum(['dark', 'light', 'auto', 'custom']).default('dark').describe('Color theme'),
  customCss: z.string().optional().describe('Path to custom theme CSS file'),
})
export type ThemeConfig = z.infer<typeof ThemeConfig>

// ── Context / Compaction Config ───────────────────────────────────

export const ContextConfig = z.object({
  maxTokens: z
    .number()
    .int()
    .min(1000)
    .max(1000000)
    .default(200000)
    .describe('Maximum context window size in tokens'),
  compactionThreshold: z
    .number()
    .min(0.1)
    .max(0.95)
    .default(0.8)
    .describe('Trigger compaction when context exceeds this fraction of maxTokens'),
  keepRecentMessages: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of recent messages to preserve during compaction'),
})
export type ContextConfig = z.infer<typeof ContextConfig>

// ── Agent Loop Config ─────────────────────────────────────────────

export const AgentConfig = z.object({
  maxIterations: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Max tool calls per agent turn'),
  maxSubagents: z.number().int().min(0).max(20).default(5).describe('Max concurrent subagents'),
  defaultPermissionMode: PermissionMode.default('ask').describe(
    'Default permission mode for new sessions',
  ),
})
export type AgentConfig = z.infer<typeof AgentConfig>

// ── Telemetry Config ──────────────────────────────────────────────

export const TelemetryConfig = z.object({
  enabled: z.boolean().default(false).describe('Send anonymous usage telemetry'),
  endpoint: z.string().url().optional().describe('Custom telemetry endpoint'),
})
export type TelemetryConfig = z.infer<typeof TelemetryConfig>

// ── Root Config ───────────────────────────────────────────────────

export const ForgeConfig = z.object({
  $schema: z.string().optional().describe('JSON Schema URL for editor validation'),
  model: ModelConfig.describe('Default model configuration'),
  providers: z
    .record(z.string(), ProviderConfig)
    .default({})
    .describe('Provider-specific settings'),
  permissions: z
    .object({
      mode: PermissionMode.default('ask').describe('Default permission mode'),
      rules: z.array(PermissionRule).default([]).describe('Tool-specific permission rules'),
    })
    .default({ mode: 'ask', rules: [] })
    .describe('Permission configuration'),
  context: ContextConfig.default({
    maxTokens: 200000,
    compactionThreshold: 0.8,
    keepRecentMessages: 10,
  }).describe('Context window and compaction settings'),
  agent: AgentConfig.default({
    maxIterations: 50,
    maxSubagents: 5,
    defaultPermissionMode: 'ask',
  }).describe('Agent loop configuration'),
  mcp: z.record(z.string(), McpServerConfig).default({}).describe('MCP server configurations'),
  hooks: z.array(HookConfig).default([]).describe('Event hook configurations'),
  plugins: z.array(PluginConfig).default([]).describe('Plugin configurations'),
  skills: z.array(SkillConfig).default([]).describe('Skill configurations'),
  sandbox: SandboxConfig.default({
    provider: 'none',
    network: true,
    allowedHosts: [],
    readOnly: false,
  }).describe('Sandbox configuration'),
  theme: ThemeConfig.default({ name: 'dark' }).describe('UI theme configuration'),
  telemetry: TelemetryConfig.default({ enabled: false }).describe('Telemetry configuration'),
  server: z
    .object({
      host: z.string().default('127.0.0.1').describe('Server bind host'),
      port: z.number().int().min(1024).max(65535).default(3845).describe('Server bind port'),
    })
    .default({ host: '127.0.0.1', port: 3845 })
    .describe('Server configuration'),
})
export type ForgeConfig = z.infer<typeof ForgeConfig>

// ── Config Source (per-scope) ─────────────────────────────────────

export const ConfigSource = z.object({
  path: z.string().describe('Path to the config file'),
  scope: z.enum(['global', 'project', 'local', 'session']).describe('Config scope'),
  raw: ForgeConfig.partial().describe('Raw config content from this source'),
})
export type ConfigSource = z.infer<typeof ConfigSource>
