/**
 * Content/nav integrity checks for the VitePress docs source (Phase 152).
 * Guarantees: every nav/sidebar link resolves to a page, every internal
 * markdown link resolves, external links are https, and the generated CLI
 * reference is present and in the expected shape.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const pkgRoot = join(import.meta.dir, '..')
const srcDir = join(pkgRoot, 'src')
const BASE = '/Munchkin-CLI/docs/'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === 'node_modules' || entry === '.vitepress' || entry === 'dist') {
      continue
    }
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const mdFiles = walk(srcDir).filter((f) => f.endsWith('.md'))
const mdRelativeToSrc = (f: string) => relative(srcDir, f).replaceAll('\\', '/')

/** Map a site-internal href (absolute-from-docs-base or relative) to the src .md file it must point at. */
function resolveHref(href: string, fromPage: string): string | undefined {
  if (/^(https?):\/\//.test(href)) return undefined
  let path = href.split('#')[0]
  if (path === '') return undefined
  if (path.startsWith(BASE)) path = path.slice(BASE.length)
  else if (path.startsWith('/')) path = path.slice(1) // absolute-from-docs-base — VitePress prefixes with base
  path = path.replace(/\.html?$/, '')
  if (path.endsWith('.md')) {
    const pageDir = dirnameOf(fromPage)
    const resolved = join(pageDir, path)
    return relative(srcDir, resolved).replaceAll('\\', '/')
  }
  const withMd = `${path}.md`
  return existsSync(join(srcDir, withMd)) ? withMd : undefined
}

function dirnameOf(file: string): string {
  const rel = relative(srcDir, file)
  const parts = rel.split(/[\\/]/).slice(0, -1)
  return join(srcDir, ...parts)
}

const allMd = new Set(mdFiles.map(mdRelativeToSrc))

describe('docs source integrity', () => {
  it('has pages for every nav and sidebar link in the VitePress config', () => {
    const config = readFileSync(join(srcDir, '.vitepress', 'config.mts'), 'utf8')
    const links = [...config.matchAll(/link: '([^']+)'/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(6)
    for (const link of links) {
      if (link.startsWith('http')) continue // external (GitHub) — fine
      expect(existsSync(join(srcDir, `${link}.md`)), `missing page for link ${link}`).toBe(true)
    }
  })

  it('resolves every internal markdown link on every page', () => {
    for (const file of mdFiles) {
      const text = readFileSync(file, 'utf8')
      const hrefs = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
      for (const href of hrefs) {
        if (/^(https?):\/\//.test(href)) continue
        const resolved = resolveHref(href, file)
        expect(
          resolved,
          `${mdRelativeToSrc(file)} -> ${href} resolves to a source page`,
        ).toBeDefined()
        expect(
          resolved !== undefined && allMd.has(resolved),
          `${mdRelativeToSrc(file)} -> ${href} -> ${resolved ?? '?'} exists`,
        ).toBe(true)
      }
    }
  })

  it('uses only https for external links', () => {
    for (const file of mdFiles) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
        expect(m[1].startsWith('https://'), `${mdRelativeToSrc(file)}: ${m[1]} is https`).toBe(true)
      }
    }
  })

  it('generates the CLI reference from the real binary shape', () => {
    const cliMd = join(srcDir, 'reference', 'cli.md')
    expect(existsSync(cliMd)).toBe(true)
    const text = readFileSync(cliMd, 'utf8')
    expect(text).toContain('forge serve')
    expect(text).toContain('forge setup')
    expect(text).toContain('do not edit it by hand')
  })
})
