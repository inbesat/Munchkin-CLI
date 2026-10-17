/**
 * Site integrity gate for the assembled GitHub Pages artifact (Phase 152).
 * Crawls every html page in dist-docs/, resolves every internal href/src, and
 * fails if any internal target is missing — the "all pages load / all links
 * work" deliverable as a repeatable test.
 *
 * Prereq: bun run scripts/assemble-pages-site.ts (CI runs it before this test).
 * Usage: bun test scripts/pages-site.test.ts
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const siteRoot = join(repoRoot, 'dist-docs')
const PAGES_BASE = '/Munchkin-CLI/'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Map an href to the file it must exist as inside dist-docs, or null for external/anchor. */
function resolveTarget(href: string, pageFile: string): string | null {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('data:'))
    return null
  let path = href.split('#')[0].split('?')[0]
  if (path === '') return null // pure anchor
  if (path.startsWith(PAGES_BASE)) {
    // base-prefixed absolute URLs (VitePress router + assets) resolve from the site root
    path = path.slice(PAGES_BASE.length)
    const abs = resolve(normalize(join(siteRoot, path)))
    if (existsSync(abs) && statSync(abs).isDirectory()) return join(abs, 'index.html')
    return abs
  }
  if (path.startsWith('/')) return null // non-repo absolute (e.g. other domains) — external check handles
  const pageDir = dirname(pageFile)
  const target = normalize(join(pageDir, path))
  const abs = resolve(target)
  if (!abs.startsWith(resolve(siteRoot))) return null
  if (existsSync(abs) && statSync(abs).isDirectory()) return join(abs, 'index.html')
  return abs
}

describe.skipIf(!existsSync(join(siteRoot, 'index.html')))('assembled pages site', () => {
  it('has the three sections in place', () => {
    expect(existsSync(join(siteRoot, 'index.html')), 'landing at root').toBe(true)
    expect(existsSync(join(siteRoot, 'docs', 'index.html')), 'docs at /docs/').toBe(true)
    expect(existsSync(join(siteRoot, 'plugins', 'index.html')), 'plugin docs at /plugins/').toBe(
      true,
    )
    for (const demo of ['help', 'setup', 'doctor']) {
      expect(existsSync(join(siteRoot, 'demos', `${demo}.gif`)), `demo ${demo}.gif shipped`).toBe(
        true,
      )
    }
  })

  it('resolves every internal href/src on every page', () => {
    const pages = walk(siteRoot).filter((f) => f.endsWith('.html'))
    expect(pages.length).toBeGreaterThan(15)
    const attrs = [...pages].flatMap((page) => {
      const html = readFileSync(page, 'utf8')
      return [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => ({ page, href: m[1] }))
    })
    expect(attrs.length).toBeGreaterThan(50)
    for (const { page, href } of attrs) {
      const relPage = page.slice(siteRoot.length + 1)
      const target = resolveTarget(href, page)
      if (target === null) continue
      expect(
        existsSync(target),
        `${relPage}: ${href} -> ${target.slice(siteRoot.length + 1)}`,
      ).toBe(true)
    }
  })

  it('uses https for every external link', () => {
    for (const page of walk(siteRoot).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(page, 'utf8')
      for (const m of html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)) {
        expect(
          m[1].startsWith('https://'),
          `${page.slice(siteRoot.length + 1)}: ${m[1]} is https`,
        ).toBe(true)
      }
    }
  })
})
