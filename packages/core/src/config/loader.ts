import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, mergeConfigs } from './defaults'
import { ForgeConfig } from './schema'

const CONFIG_FILE = 'settings.json'

const GLOBAL_DIR = join(homedir(), '.config', 'forge')
const PROJECT_DIR = '.forge'
const LOCAL_DIR = '.forge.local'

interface LoadOptions {
  cwd?: string
  cliFlags?: Partial<ForgeConfig>
}

interface LoadResult {
  config: ForgeConfig
  sources: string[]
  errors: string[]
}

function readJsonFile(filePath: string): Partial<ForgeConfig> | null {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Partial<ForgeConfig>
  } catch {
    return null
  }
}

function loadScope(dir: string): { config: Partial<ForgeConfig>; path: string } | null {
  const filePath = join(dir, CONFIG_FILE)
  const raw = readJsonFile(filePath)
  if (!raw) return null
  return { config: raw, path: filePath }
}

/**
 * Load config from all scopes and merge them.
 * Priority (highest to lowest): CLI flags → local → project → global → defaults.
 */
export function loadConfig(options: LoadOptions = {}): LoadResult {
  const cwd = options.cwd ?? process.cwd()
  const sources: string[] = []
  const errors: string[] = []

  // Start with defaults
  let merged: Partial<ForgeConfig> = { ...DEFAULT_CONFIG }

  // Load global config
  const globalScope = loadScope(GLOBAL_DIR)
  if (globalScope) {
    merged = mergeConfigs(merged, globalScope.config)
    sources.push(globalScope.path)
  }

  // Load project config
  const projectScope = loadScope(join(cwd, PROJECT_DIR))
  if (projectScope) {
    merged = mergeConfigs(merged, projectScope.config)
    sources.push(projectScope.path)
  }

  // Load local config (gitignored)
  const localScope = loadScope(join(cwd, LOCAL_DIR))
  if (localScope) {
    merged = mergeConfigs(merged, localScope.config)
    sources.push(localScope.path)
  }

  // Apply CLI flags (highest priority)
  if (options.cliFlags) {
    merged = mergeConfigs(merged, options.cliFlags)
  }

  // Validate final config
  const result = ForgeConfig.safeParse(merged)
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`)
    }
    // Return defaults on validation failure
    return {
      config: DEFAULT_CONFIG,
      sources,
      errors,
    }
  }

  return {
    config: result.data,
    sources,
    errors,
  }
}

/**
 * Get the path where project config should be created.
 */
export function getProjectConfigPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), PROJECT_DIR, CONFIG_FILE)
}

/**
 * Get the path where global config should be created.
 */
export function getGlobalConfigPath(): string {
  return join(GLOBAL_DIR, CONFIG_FILE)
}

/**
 * Get the path where local config should be created.
 */
export function getLocalConfigPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), LOCAL_DIR, CONFIG_FILE)
}
