/**
 * Builds the plugin docs site from `marketplace/plugins/*` (Phase 115).
 * Output: static HTML in `dist-docs/`, ready for GitHub Pages upload.
 * Usage: bun run scripts/generate-plugin-docs.ts
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { generatePluginDocs, renderDocsSite, writeDocsSite } from '../packages/plugin-kernel/src/docs/generator'

const repoRoot = join(import.meta.dir, '..')
const pluginsRoot = join(repoRoot, 'marketplace', 'plugins')
const outDir = join(repoRoot, 'dist-docs')

if (!existsSync(pluginsRoot)) {
  console.error(`no plugins directory at ${pluginsRoot} - nothing to document`)
  process.exit(1)
}

const entries = readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && statSync(join(pluginsRoot, entry.name, 'forge.plugin.json')).isFile())
  .map((entry) => {
    const dir = join(pluginsRoot, entry.name)
    const page = generatePluginDocs(dir, { slug: entry.name })
    return { slug: entry.name, page }
  })

if (entries.length === 0) {
  console.error('no plugin manifests found - nothing to document')
  process.exit(1)
}

const site = renderDocsSite(entries)
const written = writeDocsSite(site, outDir)
if (!written.ok) {
  console.error(`docs site write failed: ${written.error}`)
  process.exit(1)
}
console.log(`docs site: ${entries.length} plugin pages -> ${outDir}`)
