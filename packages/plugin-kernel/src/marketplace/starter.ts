/**
 * Official starter marketplace (Phase 111): the committed `marketplace/`
 * directory at the repository root is the publishable GitHub repo
 * (`forge-workshop/marketplace`). `findStarterMarketplace` locates it from
 * any working position so forge can browse/install the curated catalog
 * before the hosted copy exists.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** `owner/repo` shorthand consumed by the Phase-110 client. */
export const STARTER_MARKETPLACE_SOURCE = 'forge-workshop/marketplace'

/** Where the hosted catalog will live once the repo is published. */
export const OFFICIAL_MARKETPLACE_URL = `https://raw.githubusercontent.com/${STARTER_MARKETPLACE_SOURCE}/HEAD/marketplace.json`

export interface StarterMarketplace {
  /** Marketplace repo root (the directory containing `marketplace.json`). */
  root: string
  catalogPath: string
}

/**
 * Walk the candidate directories upward looking for `marketplace/marketplace.json`.
 * Returns undefined when the starter marketplace is not present (e.g. when forge
 * runs from an exported binary outside the repo).
 */
export function findStarterMarketplace(
  fromDirs: readonly string[],
): StarterMarketplace | undefined {
  for (const start of fromDirs) {
    let current = start
    for (;;) {
      const catalogPath = join(current, 'marketplace', 'marketplace.json')
      if (existsSync(catalogPath)) {
        return { root: join(current, 'marketplace'), catalogPath }
      }
      const parent = join(current, '..')
      if (parent === current) break
      current = parent
    }
  }
  return undefined
}
