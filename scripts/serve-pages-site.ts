/**
 * Serves the assembled dist-docs artifact for local verification (Phase 152).
 * Usage: bun run scripts/serve-pages-site.ts [port]  (default 8877)
 */

import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const root = join(repoRoot, 'dist-docs')
const port = Number(process.argv[2] ?? 8877)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url)
    let path = decodeURIComponent(url.pathname).replaceAll('\\', '/')
    // GitHub project pages serve the artifact under /Munchkin-CLI/ — simulate locally
    if (path.startsWith('/Munchkin-CLI/')) path = path.slice('/Munchkin-CLI'.length)
    let file = normalize(join(root, path))
    if (!file.startsWith(normalize(root))) return new Response('forbidden', { status: 403 })
    if (statSyncSafe(file) === 'dir') file = join(file, 'index.html')
    if (statSyncSafe(file) === 'missing') {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    const body = readFileSync(file)
    return new Response(body, {
      headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' },
    })
  },
})

function statSyncSafe(path: string): 'dir' | 'file' | 'missing' {
  try {
    return statSync(path).isDirectory() ? 'dir' : 'file'
  } catch {
    return 'missing'
  }
}

console.log(`serving ${root} at http://localhost:${port}`)
