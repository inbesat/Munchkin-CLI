import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Auto-update checker (Phase 150). Compares the running version against the
 * latest published npm version and caches the result under
 * `~/.config/forge/update-check.json`, so launch checks stay fast, offline
 * safe, and rate-limited to one request per TTL window.
 */

export const DEFAULT_UPDATE_TTL_MS = 24 * 60 * 60 * 1000
export const DEFAULT_PACKAGE_NAME = 'forge'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  checkedAt: number
}

export interface UpdateCacheEntry {
  checkedAt: number
  latestVersion: string
  updateAvailable: boolean
  notifiedAt?: number
}

export type UpdateFetch = (
  url: string,
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>

export interface UpdateCheckOptions {
  currentVersion: string
  packageName?: string
  endpoint?: string
  fetch?: UpdateFetch
  cacheFile?: string
  ttlMs?: number
  noticeTtlMs?: number
  timeoutMs?: number
  now?: () => number
}

export function getUpdateCachePath(): string {
  return join(homedir(), '.config', 'forge', 'update-check.json')
}

/** Semver-ish comparison: numeric segments, `v` prefix tolerated, prereleases older. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = '', prerelease] = version.replace(/^v/, '').split('-', 2)
    return { numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0), prerelease }
  }
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const l = left.numbers[i] ?? 0
    const r = right.numbers[i] ?? 0
    if (l !== r) return l < r ? -1 : 1
  }
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === undefined) return 1
  if (right.prerelease === undefined) return -1
  return left.prerelease < right.prerelease ? -1 : 1
}

export function readUpdateCache(file: string = getUpdateCachePath()): UpdateCacheEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UpdateCacheEntry>
    if (
      typeof parsed.checkedAt !== 'number' ||
      typeof parsed.latestVersion !== 'string' ||
      typeof parsed.updateAvailable !== 'boolean'
    ) {
      return null
    }
    return {
      checkedAt: parsed.checkedAt,
      latestVersion: parsed.latestVersion,
      updateAvailable: parsed.updateAvailable,
      ...(typeof parsed.notifiedAt === 'number' ? { notifiedAt: parsed.notifiedAt } : {}),
    }
  } catch {
    return null
  }
}

export function writeUpdateCache(file: string, entry: UpdateCacheEntry): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`)
}

/**
 * Check for a newer version. Serves a fresh cache without any network call;
 * otherwise queries the registry and records the result. Throws on failures
 * (callers that must not fail use `refreshUpdateCache`).
 */
export async function checkForUpdate(opts: UpdateCheckOptions): Promise<UpdateCheckResult> {
  const now = (opts.now ?? Date.now)()
  const ttlMs = opts.ttlMs ?? DEFAULT_UPDATE_TTL_MS
  const cacheFile = opts.cacheFile ?? getUpdateCachePath()
  const cached = readUpdateCache(cacheFile)
  if (cached && now - cached.checkedAt < ttlMs) {
    return {
      currentVersion: opts.currentVersion,
      latestVersion: cached.latestVersion,
      updateAvailable: compareVersions(opts.currentVersion, cached.latestVersion) < 0,
      checkedAt: cached.checkedAt,
    }
  }

  const packageName = opts.packageName ?? DEFAULT_PACKAGE_NAME
  const endpoint = opts.endpoint ?? `https://registry.npmjs.org/${packageName}/latest`
  const doFetch =
    opts.fetch ??
    ((url: string) => fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 1500) }))
  const response = await doFetch(endpoint)
  if (!response.ok) {
    throw new Error(`update check failed: registry responded ${response.status ?? 'error'}`)
  }
  const payload = (await response.json()) as { version?: unknown }
  if (typeof payload.version !== 'string' || payload.version === '') {
    throw new Error('update check failed: registry response has no version')
  }

  const result: UpdateCheckResult = {
    currentVersion: opts.currentVersion,
    latestVersion: payload.version,
    updateAvailable: compareVersions(opts.currentVersion, payload.version) < 0,
    checkedAt: now,
  }
  // Keep the notification throttle only while the latest version is unchanged.
  const notifiedAt = cached?.latestVersion === result.latestVersion ? cached.notifiedAt : undefined
  writeUpdateCache(cacheFile, {
    checkedAt: result.checkedAt,
    latestVersion: result.latestVersion,
    updateAvailable: result.updateAvailable,
    ...(notifiedAt !== undefined ? { notifiedAt } : {}),
  })
  return result
}

export function formatUpdateNotice(result: UpdateCheckResult): string | null {
  if (!result.updateAvailable) return null
  return `forge ${result.latestVersion} is available (current ${result.currentVersion}). Update: npm i -g forge`
}

/**
 * Synchronous, cache-only notice for CLI launch: returns the update line when
 * a cached check says a newer version exists and it has not been shown within
 * the notice TTL. Marks the notice as shown.
 */
export function updateNotice(opts: UpdateCheckOptions): string | null {
  const now = (opts.now ?? Date.now)()
  const noticeTtlMs = opts.noticeTtlMs ?? DEFAULT_UPDATE_TTL_MS
  const cacheFile = opts.cacheFile ?? getUpdateCachePath()
  const cached = readUpdateCache(cacheFile)
  if (!cached) return null
  const notice = formatUpdateNotice({
    currentVersion: opts.currentVersion,
    latestVersion: cached.latestVersion,
    updateAvailable: compareVersions(opts.currentVersion, cached.latestVersion) < 0,
    checkedAt: cached.checkedAt,
  })
  if (notice === null) return null
  if (cached.notifiedAt !== undefined && now - cached.notifiedAt < noticeTtlMs) return null
  writeUpdateCache(cacheFile, {
    checkedAt: cached.checkedAt,
    latestVersion: cached.latestVersion,
    updateAvailable: cached.updateAvailable,
    notifiedAt: now,
  })
  return notice
}

/** Background-safe refresh: never throws, returns null on failure. */
export async function refreshUpdateCache(
  opts: UpdateCheckOptions,
): Promise<UpdateCheckResult | null> {
  try {
    return await checkForUpdate(opts)
  } catch {
    return null
  }
}
