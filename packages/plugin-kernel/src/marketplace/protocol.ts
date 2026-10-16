import { join } from 'node:path'
/**
 * Marketplace protocol (Phase 110): browse/search/install/update/uninstall
 * plugins from a `marketplace.json` catalog hosted on GitHub (or any URL).
 *
 * Catalog shape:
 *   { updated?: string, plugins: [{ name, repo, version, description?, tags? }] }
 *
 * `repo` accepts a git URL (including file:// for tests/offline) or an
 * `owner/repo` shorthand resolved to raw.githubusercontent for catalogs and
 * to a git clone URL for installs, via the Phase-109 loader machinery.
 */
import { type PluginSourceDescriptor, loadPlugins } from '../plugin/loader'
import { MarketplaceRegistry } from './registry'

export interface MarketplaceEntry {
  name: string
  repo: string
  version: string
  description?: string
  tags?: string[]
}

export interface MarketplaceCatalog {
  updated?: string
  plugins: MarketplaceEntry[]
}

export interface ParsedMarketplace {
  catalog?: MarketplaceCatalog
  errors: string[]
}

export interface MarketplaceClientOptions {
  /** `owner/repo` shorthand or a full marketplace.json URL. */
  source: string
  fetchImpl?: typeof fetch
}

export interface InstallRequest {
  name: string
  /** Pin to this version (default: catalog version). */
  version?: string
}

export interface InstallOptions {
  /** Registry + plugin acquisition base directory. */
  baseDir: string
  currentVersion: string
}

export interface MarketplaceResult {
  ok: boolean
  entries?: MarketplaceEntry[]
  dir?: string
  version?: string
  error?: string
}

/** Parse + validate a marketplace catalog. Per-entry problems are collected. */
export function parseMarketplace(raw: string): ParsedMarketplace {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return {
      errors: [
        `marketplace.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['marketplace.json must be a JSON object'] }
  }
  const record = data as { updated?: unknown; plugins?: unknown }
  if (!Array.isArray(record.plugins)) return { errors: ['marketplace.plugins must be an array'] }

  const catalog: MarketplaceCatalog = { plugins: [] }
  if (typeof record.updated === 'string') catalog.updated = record.updated
  const errors: string[] = []
  for (const entry of record.plugins) {
    if (entry === null || typeof entry !== 'object') {
      errors.push('marketplace entry must be an object')
      continue
    }
    const candidate = entry as Record<string, unknown>
    const name = candidate.name
    const repo = candidate.repo
    const version = candidate.version
    if (typeof name !== 'string' || name.length === 0) {
      errors.push('marketplace entry missing `name`')
      continue
    }
    if (typeof repo !== 'string' || repo.length === 0) {
      errors.push(`marketplace entry '${name}' missing \`repo\``)
      continue
    }
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
      errors.push(`marketplace entry '${name}' has invalid version`)
      continue
    }
    catalog.plugins.push({
      name,
      repo,
      version,
      ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
      ...(Array.isArray(candidate.tags)
        ? { tags: candidate.tags.filter((t): t is string => typeof t === 'string') }
        : {}),
    })
  }
  return { catalog, errors: errors.length > 0 ? errors : [] }
}

function catalogUrl(source: string): string {
  if (source.startsWith('http')) {
    return source.endsWith('marketplace.json')
      ? source
      : `${source.replace(/\/$/, '')}/marketplace.json`
  }
  const [owner, repo] = source.split('/')
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/marketplace.json`
}

function repoCloneUrl(entry: { name: string; repo: string }): string {
  if (/^(?:https?|file):/.test(entry.repo) || entry.repo.startsWith('/')) return entry.repo
  return `https://github.com/${entry.repo}`
}

/** Route a catalog entry's repo at the right Phase-109 source type. */
function repoDescriptor(
  entry: { name: string; repo: string },
  baseDir: string,
): PluginSourceDescriptor {
  // Absolute filesystem path (POSIX or Windows drive) → load in place.
  if (entry.repo.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry.repo)) {
    return { type: 'local', path: entry.repo }
  }
  return { type: 'git', repo: repoCloneUrl(entry), cacheDir: join(baseDir, 'plugins', entry.name) }
}

export class MarketplaceClient {
  private readonly source: string
  private readonly fetchImpl: typeof fetch

  constructor(options: MarketplaceClientOptions) {
    this.source = options.source
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /** Fetch + parse the catalog. */
  async getCatalog(): Promise<{ ok: boolean; catalog?: MarketplaceCatalog; error?: string }> {
    try {
      const response = await this.fetchImpl(catalogUrl(this.source))
      if (!response.ok) {
        return {
          ok: false,
          error: `catalog fetch failed: ${response.status} ${response.statusText}`,
        }
      }
      const parsed = parseMarketplace(await response.text())
      if (parsed.catalog === undefined) {
        return { ok: false, error: parsed.errors.join('; ') }
      }
      return { ok: true, catalog: parsed.catalog }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** List all catalog entries. */
  async browse(): Promise<MarketplaceResult> {
    const { ok, catalog, error } = await this.getCatalog()
    if (!ok) return { ok: false, error }
    return { ok: true, entries: catalog?.plugins ?? [] }
  }

  /** Filter catalog entries by name/description/tags substring. */
  async search(query: string): Promise<MarketplaceResult> {
    const { ok, catalog, error } = await this.getCatalog()
    if (!ok) return { ok: false, error }
    const needle = query.toLowerCase()
    const entries = (catalog?.plugins ?? []).filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        (entry.description ?? '').toLowerCase().includes(needle) ||
        (entry.tags ?? []).some((tag) => tag.toLowerCase().includes(needle)),
    )
    return { ok: true, entries }
  }

  /** Install a catalog entry: acquire via Phase-109 loader, pin + record. */
  async install(
    request: InstallRequest,
    options: InstallOptions,
  ): Promise<MarketplaceResult & { registry?: MarketplaceRegistry }> {
    const { ok, catalog, error } = await this.getCatalog()
    if (!ok) return { ok: false, error }
    const entry = (catalog?.plugins ?? []).find((e) => e.name === request.name)
    if (entry === undefined)
      return { ok: false, error: `plugin not in marketplace: ${request.name}` }

    const pinned = request.version ?? entry.version
    if (pinned !== entry.version) {
      return {
        ok: false,
        error: `version mismatch: marketplace has ${entry.version}, requested ${pinned}`,
      }
    }

    const report = loadPlugins([repoDescriptor(entry, options.baseDir)], {
      currentVersion: options.currentVersion,
    })
    const loaded = report.plugins[0]
    if (loaded === undefined) {
      return { ok: false, error: report.errors.map((e) => e.reason).join('; ') || 'install failed' }
    }

    const registry = new MarketplaceRegistry(options.baseDir)
    registry.record({
      name: entry.name,
      version: entry.version,
      dir: loaded.dir,
      installedAt: Date.now(),
    })
    return { ok: true, dir: loaded.dir, version: entry.version, registry }
  }

  /** Reinstall when the catalog version differs from the pinned version. */
  async update(
    request: { name: string },
    options: InstallOptions,
  ): Promise<MarketplaceResult & { registry?: MarketplaceRegistry }> {
    const registry = new MarketplaceRegistry(options.baseDir)
    const installed = registry.get(request.name)
    if (installed === undefined) return { ok: false, error: `not installed: ${request.name}` }

    const { ok, catalog, error } = await this.getCatalog()
    if (!ok) return { ok: false, error }
    const entry = (catalog?.plugins ?? []).find((e) => e.name === request.name)
    if (entry === undefined)
      return { ok: false, error: `plugin not in marketplace: ${request.name}` }
    if (entry.version === installed.version) {
      return { ok: true, version: installed.version, registry, dir: installed.dir }
    }

    // Fresh clone at the new version: git clone refuses a non-empty target,
    // so replace the previous installation first.
    this.uninstall(request.name, options.baseDir, true)
    return this.install({ name: request.name }, options)
  }

  /** Remove a plugin's registry entry (and directory when requested). */
  uninstall(name: string, baseDir: string, removeDir = false): boolean {
    return new MarketplaceRegistry(baseDir).uninstall(name, removeDir)
  }
}
