import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Installed-plugin registry (Phase 110): a JSON file store under the forge
 * base directory recording every marketplace-installed plugin with its
 * pinned version and directory.
 */

export interface InstalledPlugin {
  name: string
  version: string
  dir: string
  installedAt: number
}

const REGISTRY_FILE = 'installed.json'

export class MarketplaceRegistry {
  private readonly basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  private filePath(): string {
    return join(this.basePath, REGISTRY_FILE)
  }

  private readAll(): Record<string, InstalledPlugin> {
    if (!existsSync(this.filePath())) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.filePath(), 'utf-8')) as Record<
        string,
        InstalledPlugin
      >
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** Get one installed plugin by marketplace name. */
  get(name: string): InstalledPlugin | undefined {
    return this.readAll()[name]
  }

  installed(): InstalledPlugin[] {
    return Object.values(this.readAll())
  }

  record(entry: InstalledPlugin): void {
    const all = this.readAll()
    all[entry.name] = entry
    writeFileSync(this.filePath(), JSON.stringify(all, null, 2), 'utf-8')
  }

  /** Remove an installed plugin's registry entry (and its directory). */
  uninstall(name: string, removeDir = false): boolean {
    const all = this.readAll()
    const entry = all[name]
    if (entry === undefined) return false
    delete all[name]
    writeFileSync(this.filePath(), JSON.stringify(all, null, 2), 'utf-8')
    if (removeDir && existsSync(entry.dir)) {
      rmSync(entry.dir, { recursive: true, force: true })
    }
    return true
  }
}
