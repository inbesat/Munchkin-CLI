/**
 * Landing page checks (Phase 152). Runs after `bun run build` (turbo test
 * dependsOn build): verifies the built HTML, demo assets, and link hygiene.
 * Standalone runs without a prior build are skipped, not failed.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkgRoot = join(import.meta.dir, '..')
const dist = join(pkgRoot, 'dist')

describe.skipIf(!existsSync(join(dist, 'index.html')))('landing build', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')

  it('renders the key sections', () => {
    for (const needle of [
      'The CLI coding agent',
      'Event-sourced sessions',
      'Permission-first tooling',
      'See it run',
      'Install',
      'GitHub Releases',
    ]) {
      expect(html.includes(needle), `index.html contains "${needle}"`).toBe(true)
    }
  })

  it('references the demo GIFs and ships them', () => {
    for (const name of ['help', 'setup', 'doctor']) {
      expect(html.includes(`./demos/${name}.gif`), `index.html references ${name}.gif`).toBe(true)
      const gif = readFileSync(join(dist, 'demos', `${name}.gif`))
      expect(gif.length, `${name}.gif is non-trivial (>5KB)`).toBeGreaterThan(5_000)
      expect(gif.subarray(0, 4).toString('ascii').startsWith('GIF8')).toBe(true)
    }
  })

  it('links the docs section relatively and uses no insecure links', () => {
    expect(html.includes('href="./docs/"')).toBe(true)
    // xmlns identifiers inside data: URIs are legal and are not fetched links
    const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    for (const link of links) {
      if (link.startsWith('data:')) continue
      expect(link.startsWith('http://'), `${link} is not insecure`).toBe(false)
    }
  })

  it('is viewport-responsive by construction', () => {
    expect(html.includes('name="viewport"')).toBe(true)
    expect(html.includes('@media')).toBe(true)
    expect(html.includes('640px')).toBe(true)
  })
})
