/**
 * Bundled connector presets (Phase 121): ready-made configurations for the
 * most common MCP servers. `installPreset` writes the resolved server
 * entry into the forge MCP config (`mcp-servers.json` in the forge config
 * directory) so one command sets a server up.
 * No-throw convention across the module.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ConnectorPreset {
  id: string
  description: string
  docsUrl: string
  /** Base spawn command; preset-specific args (e.g. filesystem root) get appended. */
  command: string
  baseArgs: readonly string[]
  /** Env vars the server needs, resolved from the host environment at install time. */
  requiredEnv?: readonly string[]
  /** Extra args the user must/can supply at install time. */
  expectsArgs?: { name: string; description: string; optional?: boolean }[]
}

export const CONNECTOR_PRESETS: readonly ConnectorPreset[] = [
  {
    id: 'github',
    description: 'GitHub MCP server: repos, issues, pull requests, code search',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_TOKEN'],
  },
  {
    id: 'context7',
    description: 'Context7 MCP server: up-to-date library documentation',
    docsUrl: 'https://github.com/upstash/context7',
    command: 'npx',
    baseArgs: ['-y', '@upstash/context7-mcp'],
  },
  {
    id: 'playwright',
    description: 'Playwright MCP server: browser automation and page interaction',
    docsUrl: 'https://github.com/microsoft/playwright-mcp',
    command: 'npx',
    baseArgs: ['-y', '@playwright/mcp@latest'],
  },
  {
    id: 'filesystem',
    description: 'Filesystem MCP server: sandboxed file access under a root directory',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-filesystem'],
    expectsArgs: [
      { name: 'root', description: 'Directory the server may access', optional: false },
    ],
  },
  {
    id: 'memory',
    description: 'Memory MCP server: persistent knowledge-graph memory',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'sequential-thinking',
    description: 'Sequential Thinking MCP server: structured step-by-step reasoning',
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    command: 'npx',
    baseArgs: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
]

export function getPreset(id: string): ConnectorPreset | undefined {
  return CONNECTOR_PRESETS.find((preset) => preset.id === id)
}

export interface ResolvedServerSpec {
  command: string
  args: string[]
  env: Record<string, string>
}

/** Build the concrete server spec, resolving env placeholders + user args. */
export function resolveServerSpec(
  preset: ConnectorPreset,
  args: readonly string[],
): { ok: true; spec: ResolvedServerSpec; warnings: string[] } | { ok: false; error: string } {
  const warnings: string[] = []
  const expected = preset.expectsArgs ?? []
  const requiredArgs = expected.filter((arg) => arg.optional !== true)
  if (args.length < requiredArgs.length) {
    const missing = requiredArgs
      .slice(args.length)
      .map((arg) => arg.name)
      .join(', ')
    return { ok: false, error: `missing required argument(s): ${missing}` }
  }
  const env: Record<string, string> = {}
  for (const key of preset.requiredEnv ?? []) {
    const value = process.env[key]
    if (value === undefined || value.length === 0) {
      warnings.push(
        `environment variable ${key} is not set; the server may fail to start until it is`,
      )
    } else {
      env[key] = value
    }
  }
  return {
    ok: true,
    spec: {
      command: preset.command,
      args: [...preset.baseArgs, ...args],
      env,
    },
    warnings,
  }
}

export interface McpServersConfig {
  [serverId: string]: ResolvedServerSpec
}

export class McpPresetsConfig {
  private readonly directory: string

  constructor(directory?: string) {
    this.directory = directory ?? join(homedir(), '.forge')
  }

  private get filePath(): string {
    return join(this.directory, 'mcp-servers.json')
  }

  read(): McpServersConfig {
    if (!existsSync(this.filePath)) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as McpServersConfig
      return parsed !== null && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  installedIds(): string[] {
    return Object.keys(this.read())
  }

  isInstalled(id: string): boolean {
    return this.read()[id] !== undefined
  }

  /** Merge-write a server entry (last install of an id wins). */
  set(id: string, spec: ResolvedServerSpec): void {
    mkdirSync(this.directory, { recursive: true })
    const config = this.read()
    config[id] = spec
    writeFileSync(this.filePath, JSON.stringify(config, null, 2), 'utf-8')
  }
}

export interface InstallPresetResult {
  ok: boolean
  error?: string
  warnings?: string[]
  spec?: ResolvedServerSpec
}

/** One-command install: resolve + validate + write to the forge config. */
export function installPreset(
  id: string,
  config: McpPresetsConfig,
  args: readonly string[] = [],
): InstallPresetResult {
  const preset = getPreset(id)
  if (preset === undefined) {
    return {
      ok: false,
      error: `unknown connector preset '${id}' - available: ${CONNECTOR_PRESETS.map((p) => p.id).join(', ')}`,
    }
  }
  const resolved = resolveServerSpec(preset, args)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  config.set(id, resolved.spec)
  return { ok: true, warnings: resolved.warnings, spec: resolved.spec }
}
