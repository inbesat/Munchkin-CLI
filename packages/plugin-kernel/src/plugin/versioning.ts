/**
 * Plugin versioning + rollback (Phase 114): every install/update snapshot
 * the plugin directory into an immutable per-version store; the `active`
 * directory the loader consumes is materialized from the current entry, so
 * a rollback is a re-materialization from a previous snapshot plus an
 * index/pin update.
 *
 * Store layout under the forge base directory:
 *   plugins/<name>/versions/v<major.minor.patch>/   (versioned copies)
 *   plugins/<name>/versions.json                    (index: history, pin, current)
 *   plugins/<name>/active/                          (materialized current version)
 *
 * All operations return result objects; filesystem failures become error
 * strings (no-throw repo convention).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface VersionEntry {
  version: string
  /** Snapshot directory holding this version's files. */
  dir: string
  installedAt: number
}

export interface VersionIndex {
  versions: VersionEntry[]
  pinned: string
  current: string
}

export interface VersionResult {
  ok: boolean
  error?: string
  version?: string
  dir?: string
}

export class VersionManager {
  private readonly baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  private pluginRoot(name: string): string {
    return join(this.baseDir, 'plugins', name)
  }

  private versionsFile(name: string): string {
    return join(this.pluginRoot(name), 'versions.json')
  }

  private activePath(name: string): string {
    return join(this.pluginRoot(name), 'active')
  }

  private readIndex(name: string): VersionIndex {
    const file = this.versionsFile(name)
    if (!existsSync(file)) return { versions: [], pinned: '', current: '' }
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<VersionIndex>
      return {
        versions: Array.isArray(parsed.versions) ? parsed.versions : [],
        pinned: typeof parsed.pinned === 'string' ? parsed.pinned : '',
        current: typeof parsed.current === 'string' ? parsed.current : '',
      }
    } catch {
      return { versions: [], pinned: '', current: '' }
    }
  }

  private writeIndex(name: string, index: VersionIndex): void {
    mkdirSync(this.pluginRoot(name), { recursive: true })
    writeFileSync(this.versionsFile(name), JSON.stringify(index, null, 2), 'utf-8')
  }

  private snapshotDir(name: string, version: string): string {
    return join(this.pluginRoot(name), 'versions', `v${version}`)
  }

  /** Copy `sourceDir` into the version store and re-materialize `active`. */
  private snapshotAndActivate(name: string, sourceDir: string, version: string): VersionResult {
    const snapshot = this.snapshotDir(name, version)
    try {
      rmSync(snapshot, { recursive: true, force: true })
      cpSync(sourceDir, snapshot, { recursive: true })
      const active = this.activePath(name)
      rmSync(active, { recursive: true, force: true })
      cpSync(snapshot, active, { recursive: true })
      return { ok: true, version, dir: active }
    } catch (error) {
      return {
        ok: false,
        error: `failed to snapshot version '${version}': ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * Install/record a NEW version from `sourceDir`. Refuses a version that
   * is already in the store (rollback to it instead).
   */
  recordVersion(name: string, sourceDir: string, version: string): VersionResult {
    if (!existsSync(sourceDir)) {
      return { ok: false, error: `source directory does not exist: ${sourceDir}` }
    }
    const index = this.readIndex(name)
    if (index.versions.some((v) => v.version === version)) {
      return {
        ok: false,
        error: `version '${version}' of '${name}' is already recorded - rollback to it instead`,
      }
    }
    const snapshotted = this.snapshotAndActivate(name, sourceDir, version)
    if (!snapshotted.ok) return snapshotted
    const entry: VersionEntry = {
      version,
      dir: this.snapshotDir(name, version),
      installedAt: Date.now(),
    }
    this.writeIndex(name, {
      versions: [...index.versions, entry].sort((a, b) => a.installedAt - b.installedAt),
      pinned: version,
      current: version,
    })
    return { ok: true, version, dir: this.activePath(name) }
  }

  /**
   * Update to a new version: same as recording, but refuses when the new
   * version is older than the currently pinned one (use rollback for that).
   */
  update(name: string, sourceDir: string, version: string): VersionResult {
    const current = this.currentVersion(name)
    if (current !== undefined && version !== current) {
      const newer = current.localeCompare(version, undefined, { numeric: true }) < 0
      if (!newer) {
        return {
          ok: false,
          error: `cannot update '${name}' from '${current}' to older '${version}' - use rollback`,
        }
      }
    }
    return this.recordVersion(name, sourceDir, version)
  }

  /**
   * Revert the plugin directory to a previous version (default: whichever
   * recorded version preceded the current one). History is kept; only the
   * active copy and pin move.
   */
  rollback(name: string, toVersion?: string): VersionResult {
    const index = this.readIndex(name)
    if (index.versions.length === 0) {
      return { ok: false, error: `no recorded versions for '${name}'` }
    }
    let target: VersionEntry | undefined
    if (toVersion !== undefined) {
      target = index.versions.find((v) => v.version === toVersion)
      if (target === undefined) {
        return { ok: false, error: `version '${toVersion}' is not recorded for '${name}'` }
      }
    } else {
      const currentIndex = index.versions.findIndex((v) => v.version === index.current)
      target = currentIndex > 0 ? index.versions[currentIndex - 1] : undefined
      if (target === undefined) {
        return { ok: false, error: `'${name}' is already at its earliest recorded version` }
      }
    }
    if (!existsSync(target.dir)) {
      return { ok: false, error: `version '${target.version}' snapshot is missing from disk` }
    }
    const active = this.activePath(name)
    try {
      rmSync(active, { recursive: true, force: true })
      cpSync(target.dir, active, { recursive: true })
    } catch (error) {
      return {
        ok: false,
        error: `rollback of '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    index.current = target.version
    index.pinned = target.version
    this.writeIndex(name, index)
    return { ok: true, version: target.version, dir: active }
  }

  /** Directory the loader should consume for the plugin's current version. */
  activeDir(name: string): string | undefined {
    const index = this.readIndex(name)
    return index.versions.length > 0 ? this.activePath(name) : undefined
  }

  currentVersion(name: string): string | undefined {
    const index = this.readIndex(name)
    return index.versions.length > 0 ? index.current : undefined
  }

  list(name: string): VersionEntry[] {
    return this.readIndex(name).versions
  }
}
