import { spawnSync } from 'node:child_process'
/**
 * Plugin loader (Phase 109): discover and load plugins from local paths,
 * npm-style node_modules layouts, and git repositories. Namespaced by
 * manifest name (duplicates are conflicts, not double loads); one broken
 * plugin never crashes the others (error isolation); forgeVersion
 * compatibility gates every load.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLUGIN_MANIFEST_FILE } from './format'
import { type LoadedPlugin, loadPlugin } from './manifest'

export type ForgeVersion = string

export type PluginSourceDescriptor =
  | { type: 'local'; path: string }
  | { type: 'npm'; package: string; searchRoots?: readonly string[] }
  | { type: 'git'; repo: string; cacheDir?: string }

export interface LoadedPluginEntry {
  namespace: string
  dir: string
  plugin: LoadedPlugin['manifest'] & object
  presentDirs: LoadedPlugin['presentDirs']
  source: PluginSourceDescriptor['type']
}

export interface PluginLoadError {
  source: PluginSourceDescriptor
  reason: string
}

export interface PluginLoadReport {
  /** Successfully loaded, namespaced, version-checked plugins. */
  plugins: LoadedPluginEntry[]
  /** Every failure across sources: resolution, validation, conflicts. */
  errors: PluginLoadError[]
}

export interface LoadPluginsOptions {
  /** Current forge version for compatibility checks. */
  currentVersion: ForgeVersion
  /** Injectable git clone (offline tests). Default: real `git clone --depth 1`. */
  clone?: (repo: string, targetDir: string) => { ok: boolean; stderr: string }
  /** Callable when the loader needs the engine-side hook spread; reserved. */
  manifestFile?: string
}

/** Semver-lite comparator for forgeVersion constraints. */
export function satisfiesForgeVersion(constraint: ForgeVersion, current: ForgeVersion): boolean {
  const trimmed = constraint.trim()
  if (trimmed === '' || trimmed === '*') return true
  const [currentMajor = 0, currentMinor = 0, currentPatch = 0] = current
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  const compare = (expected: string): boolean => {
    const [major = 0, minor = 0, patch = 0] = expected
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
    if (currentMajor !== major) return currentMajor > major
    if (currentMinor !== minor) return currentMinor > minor
    return currentPatch >= patch
  }
  if (trimmed.startsWith('>=')) return compare(trimmed.slice(2))
  if (trimmed.startsWith('^')) {
    const base = trimmed.slice(1)
    const [major] = base.split('.').map((part) => Number.parseInt(part, 10) || 0)
    return currentMajor === major && compare(base)
  }
  return compare(trimmed)
}

/** Load one already-on-disk plugin directory. */
export function loadPluginFromDirectory(
  dir: string,
  source: PluginSourceDescriptor['type'] = 'local',
): LoadedPluginEntry & { ok: boolean; errors: string[] } {
  const loaded = loadPlugin(dir)
  if (!loaded.ok || loaded.manifest === undefined) {
    return {
      ok: false,
      namespace: '',
      dir,
      plugin: { name: '', version: '' },
      presentDirs: loaded.presentDirs,
      source,
      errors: loaded.errors,
    }
  }
  return {
    ok: true,
    namespace: loaded.manifest.name,
    dir,
    plugin: loaded.manifest,
    presentDirs: loaded.presentDirs,
    source,
    errors: loaded.errors,
  }
}

export interface NpmLoadOptions {
  searchRoots?: readonly string[]
  manifestFile?: string
}

/** Locate + load an npm-style plugin from node_modules layouts. */
export function loadPluginFromNpm(
  packageName: string,
  options: NpmLoadOptions = {},
  source: PluginSourceDescriptor['type'] = 'npm',
): LoadedPluginEntry & { ok: boolean; errors: string[] } {
  const searchRoots = options.searchRoots ?? [process.cwd()]
  for (const root of searchRoots) {
    const dir = join(resolve(root), 'node_modules', packageName)
    if (existsSync(join(dir, PLUGIN_MANIFEST_FILE))) {
      return loadPluginFromDirectory(dir, source)
    }
  }
  return {
    ok: false,
    namespace: '',
    dir: '',
    plugin: { name: packageName, version: '' },
    presentDirs: [],
    source,
    errors: [`npm package not found in search roots: ${packageName}`],
  }
}

function cloneGitRepo(
  repo: string,
  targetDir: string,
  injected: LoadPluginsOptions['clone'],
): { ok: boolean; stderr: string } {
  if (injected) return injected(repo, targetDir)
  const result = spawnSync('git', ['clone', '--depth', '1', repo, targetDir], {
    encoding: 'utf-8',
  })
  if (result.error !== undefined) {
    return { ok: false, stderr: String(result.error) }
  }
  return { ok: result.status === 0, stderr: result.stderr ?? '' }
}

/**
 * Load plugins from the given source descriptors. Every failure — missing
 * package, clone failure, invalid manifest, incompatible forgeVersion,
 * namespace conflict — is isolated into `errors`; the remaining plugins
 * still load.
 */
export function loadPlugins(
  sources: readonly PluginSourceDescriptor[],
  options: LoadPluginsOptions,
): PluginLoadReport {
  const errors: PluginLoadError[] = []
  const plugins: LoadedPluginEntry[] = []
  const seenNames = new Set<string>()

  for (const source of sources) {
    let dir: string | undefined
    try {
      switch (source.type) {
        case 'local':
          dir = source.path
          break
        case 'npm': {
          const npmResult = loadPluginFromNpm(source.package, {
            searchRoots: source.searchRoots,
          })
          if (!npmResult.ok) {
            errors.push({ source, reason: npmResult.errors.join('; ') })
            continue
          }
          dir = npmResult.dir
          break
        }
        case 'git': {
          const cacheDir = source.cacheDir ?? join(process.cwd(), '.forge', 'git-plugins')
          const targetDir = join(
            cacheDir,
            source.repo
              .replace(/[^\w.-]+/g, '-')
              .replace(/-+$/, '')
              .slice(-80) || 'plugin',
          )
          const clone = cloneGitRepo(source.repo, targetDir, options.clone)
          if (!clone.ok) {
            errors.push({ source, reason: `git clone failed: ${clone.stderr}` })
            continue
          }
          dir = targetDir
          break
        }
      }
    } catch (error) {
      errors.push({ source, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (dir === undefined) {
      errors.push({ source, reason: 'source resolved to no directory' })
      continue
    }

    const loaded = loadPluginFromDirectory(dir, source.type)
    if (!loaded.ok || loaded.plugin.name === '') {
      errors.push({ source, reason: loaded.errors.join('; ') || 'load failed' })
      continue
    }

    if (
      loaded.plugin.forgeVersion !== undefined &&
      !satisfiesForgeVersion(loaded.plugin.forgeVersion, options.currentVersion)
    ) {
      errors.push({
        source,
        reason: `plugin '${loaded.plugin.name}' requires forgeVersion ${loaded.plugin.forgeVersion}`,
      })
      continue
    }

    if (seenNames.has(loaded.plugin.name)) {
      errors.push({
        source,
        reason: `namespace conflict: plugin '${loaded.plugin.name}' is already loaded`,
      })
      continue
    }
    seenNames.add(loaded.plugin.name)
    plugins.push({ ...loaded, source: source.type })
  }

  return { plugins, errors }
}
