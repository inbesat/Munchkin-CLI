/**
 * Launch-materials gate (Phase 153). Validates every draft in launch/ and the
 * root README: internal links resolve to real files, external links are
 * https and well-formed, no unresolved placeholders, the Discord config is a
 * valid structure, and the README ships the demo GIFs + real workflow badges.
 *
 * Usage: bun test scripts/launch-materials.test.ts
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const repoRoot = join(import.meta.dir, '..')
const launchDir = join(repoRoot, 'launch')

function mdFilesIn(dir: string): string[] {
  return ['README.md', 'show-hn.md', 'twitter-thread.md', 'reddit-post.md', 'discord-setup.md']
    .map((f) => join(dir, f))
    .filter((f) => existsSync(f))
}

const docs = [...mdFilesIn(launchDir), join(repoRoot, 'README.md')]

function extractLinks() {
  const links: Link[] = []
  for (const file of docs) {
    const md = readFileSync(file, 'utf8')
    for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) links.push({ file, target: m[1] })
    for (const m of md.matchAll(/<img src="([^"]+)"/g)) links.push({ file, target: m[1] })
    for (const m of md.matchAll(/<a href="([^"]+)"/g)) links.push({ file, target: m[1] })
  }
  return links
}

describe('launch materials', () => {
  it('has every deliverable file with non-trivial content', () => {
    const required = [
      `${launchDir}/README.md`,
      `${launchDir}/show-hn.md`,
      `${launchDir}/twitter-thread.md`,
      `${launchDir}/reddit-post.md`,
      `${launchDir}/discord-setup.md`,
      `${launchDir}/discord-config.json`,
      `${repoRoot}/README.md`,
    ]
    for (const file of required) {
      expect(existsSync(file), `${file} exists`).toBe(true)
      if (existsSync(file) && file.endsWith('.md')) {
        expect(readFileSync(file, 'utf8').length, `${file} non-trivial`).toBeGreaterThan(500)
      }
    }
  })

  it('contains no unresolved placeholders', () => {
    for (const file of docs) {
      const md = readFileSync(file, 'utf8')
      expect(md, `${file} free of TODO/FIXME/TBD/XXX`).not.toMatch(/\b(TODO|FIXME|TBD|XXX)\b/)
    }
  })

  it('resolves every internal link and uses only https externals', () => {
    const links = extractLinks()
    expect(links.length).toBeGreaterThan(20)
    for (const { file, target } of links) {
      if (target.startsWith('http')) {
        expect(target.startsWith('https://'), `${file}: ${target} is https`).toBe(true)
        continue
      }
      if (target.startsWith('#') || target.startsWith('mailto:')) continue
      const abs = join(dirname(file), target.split('#')[0])
      expect(existsSync(abs), `${file} -> ${target} exists`).toBe(true)
    }
  })

  it('references the three real demo GIFs from the README', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    for (const n of ['help', 'doctor', 'setup']) {
      const gifPath = join(repoRoot, 'packages', 'landing', 'public', 'demos', `${n}.gif`)
      expect(
        readme.includes(`packages/landing/public/demos/${n}.gif`),
        `README embeds ${n}.gif`,
      ).toBe(true)
      expect(existsSync(gifPath), `${n}.gif on disk`).toBe(true)
      const gif = readFileSync(gifPath)
      expect(gif.subarray(0, 4).toString('ascii').startsWith('GIF8'), `${n}.gif is a GIF`).toBe(
        true,
      )
      expect(gif.length, `${n}.gif non-trivial`).toBeGreaterThan(5_000)
    }
  })

  it('uses badge URLs that match real workflow files', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    for (const wf of ['ci.yml', 'release.yml']) {
      expect(readme.includes(`workflows/${wf}/badge.svg`), `badge for ${wf}`).toBe(true)
      expect(existsSync(join(repoRoot, '.github', 'workflows', wf)), `workflow ${wf} exists`).toBe(
        true,
      )
    }
  })

  it('documents the honest pre-release status', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    for (const needle of ['pending a rename', 'in preview', 'forge setup']) {
      expect(readme.includes(needle), `README mentions "${needle}"`).toBe(true)
    }
  })

  describe('discord config', () => {
    const config = JSON.parse(readFileSync(join(launchDir, 'discord-config.json'), 'utf8')) as {
      serverName: string
      roles: Array<{ name: string; color: string; hoist?: boolean; mentionable?: boolean }>
      categories: Array<{
        name: string
        channels: Array<{
          name: string
          type: string
          topic?: string
          readOnlyFor?: string[]
          maintainersOnly?: boolean
        }>
      }>
      rules: string[]
      welcomeMessage: string
    }

    it('has server identity, roles, categories, rules and welcome copy', () => {
      expect(config.serverName.length).toBeGreaterThan(0)
      expect(config.roles.length).toBeGreaterThanOrEqual(3)
      expect(config.categories.length).toBeGreaterThanOrEqual(3)
      expect(config.rules.length).toBeGreaterThanOrEqual(5)
      expect(config.welcomeMessage).toContain('forge')
    })

    it('is structurally sound: unique names, valid types, topics set, role refs exist', () => {
      const roleNames = new Set<string>()
      for (const role of config.roles) {
        expect(roleNames.has(role.name), `role ${role.name} unique`).toBe(false)
        roleNames.add(role.name)
        expect(role.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
      const channelNames = new Set<string>()
      for (const category of config.categories) {
        expect(category.channels.length).toBeGreaterThan(0)
        for (const channel of category.channels) {
          expect(channelNames.has(channel.name), `channel ${channel.name} unique`).toBe(false)
          channelNames.add(channel.name)
          expect(['text', 'voice'], `${channel.name} type valid`).toContain(channel.type)
          if (channel.type === 'text') {
            expect(channel.topic?.length ?? 0, `${channel.name} has a topic`).toBeGreaterThan(10)
          }
        }
      }
      for (const category of config.categories) {
        for (const channel of category.channels) {
          for (const roleRef of channel.readOnlyFor ?? []) {
            expect(
              roleRef === '@everyone' || roleNames.has(roleRef.slice(1)),
              `${channel.name} readOnlyFor ref "${roleRef}" is @everyone or an existing role`,
            ).toBe(true)
          }
        }
      }
      expect(config.rules.some((r) => r.toLowerCase().includes('privacy'))).toBe(true)
    })

    it('inks the privacy rule to the real privacy doc', () => {
      expect(existsSync(join(repoRoot, 'docs', 'privacy.md'))).toBe(true)
      const setup = readFileSync(join(launchDir, 'discord-setup.md'), 'utf8')
      expect(setup).toContain('docs/privacy.md')
    })
  })

  it('only contains grounded claims about model wiring', () => {
    for (const file of [
      join(launchDir, 'show-hn.md'),
      join(launchDir, 'reddit-post.md'),
      join(repoRoot, 'README.md'),
    ]) {
      const md = readFileSync(file, 'utf8')
      // the three wired providers + the honest "next" for local models
      expect(md).toContain('Ollama')
      expect(md.toLowerCase()).not.toContain('ollama support is live')
      expect(md.toLowerCase()).not.toContain('ollama wired')
    }
  })

  it('counts all deliverable files as regular files', () => {
    for (const file of docs) {
      expect(statSync(file).isFile(), `${file} is a file`).toBe(true)
    }
  })
})
