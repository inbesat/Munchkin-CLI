/**
 * Plugin manifest schema + validation (Phase 108). Hand-rolled validator —
 * plugin-kernel stays dependency-free.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_DIRECTORIES, type PluginDirectory } from './format'
import { PLUGIN_MANIFEST_FILE } from './format'

export interface ForgePluginManifest {
  name: string
  version: string
  description?: string
  author?: string
  forgeVersion?: string
  parts?: Partial<Record<PluginDirectory, boolean>>
}

export interface LoadedPlugin {
  ok: boolean
  dir: string
  manifest?: ForgePluginManifest
  /** `parts` as declared in the manifest (booleans). */
  parts?: ForgePluginManifest['parts']
  /** Canonical part directories present on disk. */
  presentDirs: PluginDirectory[]
  errors: string[]
}

/** Validate + parse a raw manifest string. Collects all problems. */
export function parsePluginManifest(raw: string): {
  manifest?: ForgePluginManifest
  errors: string[]
} {
  const errors: string[] = []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return {
      errors: [
        `manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['manifest must be a JSON object'] }
  }
  const record = data as Record<string, unknown>

  const name = record.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push('manifest.name is required and must be a non-empty string')
  }
  const version = record.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
    errors.push('manifest.version is required and must be a semver string (e.g. 1.0.0)')
  }
  if (record.description !== undefined && typeof record.description !== 'string') {
    errors.push('manifest.description must be a string')
  }
  if (record.author !== undefined && typeof record.author !== 'string') {
    errors.push('manifest.author must be a string')
  }
  if (record.forgeVersion !== undefined && typeof record.forgeVersion !== 'string') {
    errors.push('manifest.forgeVersion must be a string')
  }
  if (errors.length > 0) return { errors }

  const manifest: ForgePluginManifest = {
    name: name as string,
    version: version as string,
  }
  if (typeof record.description === 'string') manifest.description = record.description
  if (typeof record.author === 'string') manifest.author = record.author
  if (typeof record.forgeVersion === 'string') manifest.forgeVersion = record.forgeVersion
  if (record.parts !== undefined && record.parts !== null && typeof record.parts === 'object') {
    const parts = record.parts as Record<string, unknown>
    manifest.parts = {}
    for (const dir of PLUGIN_DIRECTORIES) {
      const value = parts[dir]
      if (value !== undefined) manifest.parts[dir] = value === true
    }
  }
  return { manifest, errors }
}

/** Load + validate a plugin directory: manifest round-trip and part discovery. */
export function loadPlugin(pluginDir: string): LoadedPlugin {
  const errors: string[] = []
  const manifestPath = join(pluginDir, PLUGIN_MANIFEST_FILE)
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      dir: pluginDir,
      presentDirs: [],
      errors: [`missing ${PLUGIN_MANIFEST_FILE} in ${pluginDir}`],
    }
  }

  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf-8')
  } catch (error) {
    return {
      ok: false,
      dir: pluginDir,
      presentDirs: [],
      errors: [`unreadable manifest: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  const parsed = parsePluginManifest(raw)
  if (parsed.manifest === undefined)
    return { ok: false, dir: pluginDir, presentDirs: [], errors: parsed.errors }

  const presentDirs = PLUGIN_DIRECTORIES.filter((dir) => existsSync(join(pluginDir, dir)))
  return {
    ok: true,
    dir: pluginDir,
    manifest: parsed.manifest,
    parts: parsed.manifest.parts,
    presentDirs,
    errors,
  }
}
