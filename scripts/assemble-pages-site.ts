/**
 * Assembles the complete GitHub Pages artifact (Phase 152) into `dist-docs/`:
 *
 *   dist-docs/           landing page (@forge/landing dist)
 *   dist-docs/docs/      VitePress docs site (@forge/docs src/.vitepress/dist)
 *   dist-docs/plugins/   generated plugin docs (generate-plugin-docs.ts)
 *
 * All three must be built beforehand (CI runs the turbo build first):
 *   bunx turbo build --filter=@forge/landing --filter=@forge/docs
 * Usage: bun run scripts/assemble-pages-site.ts
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const outDir = join(repoRoot, 'dist-docs')
const landingDist = join(repoRoot, 'packages', 'landing', 'dist')
const docsDist = join(repoRoot, 'packages', 'docs', 'build')

for (const required of [landingDist, docsDist]) {
  if (!existsSync(required)) {
    console.error(`missing build output: ${required}`)
    console.error('run: bunx turbo build --filter=@forge/landing --filter=@forge/docs')
    process.exit(1)
  }
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

cpSync(landingDist, outDir, { recursive: true })
cpSync(docsDist, join(outDir, 'docs'), { recursive: true })

// Plugin docs are generated fresh here (script takes an explicit out arg).
const pluginsOut = join(outDir, 'plugins')
const proc = Bun.spawn(
  ['bun', 'run', join(repoRoot, 'scripts', 'generate-plugin-docs.ts'), pluginsOut],
  { cwd: repoRoot, stdout: 'inherit', stderr: 'inherit' },
)
if ((await proc.exited) !== 0) process.exit(proc.exitCode ?? 1)

function countHtml(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) n += countHtml(full)
    else if (entry.endsWith('.html')) n += 1
  }
  return n
}

console.log(
  `assembled dist-docs: ${countHtml(outDir)} html pages ` +
    `(landing + docs + plugins) -> ${resolve(outDir)}`,
)
