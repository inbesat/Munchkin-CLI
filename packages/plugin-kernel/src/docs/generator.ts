/**
 * Plugin docs site generator (Phase 115): reads a plugin directory through
 * the Phase-108 format and emits static, dependency-free documentation HTML
 * - one page per plugin plus a site index - ready to publish via GitHub
 * Pages (see .github/workflows/docs-pages.yml).
 *
 * No-throw convention: unreadable parts become empty sections or an
 * `errors` note on the page; `writeDocsSite` returns a result object.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_DIRECTORIES } from '../plugin/format'

export interface SkillSummary {
  name: string
  description: string
}

export interface PluginDocPage {
  plugin: { name: string; version: string }
  description: string
  skills: SkillSummary[]
  commands: string[]
  hooks: string[]
  agents: string[]
  mcpServers: string[]
  errors: string[]
}

export interface PluginDocsSite {
  /** One HTML document per plugin, keyed by slug. */
  pages: { slug: string; html: string }[]
  indexHtml: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Minimal frontmatter subset (same shape as the Phase-106 skills loader). */
function parseFrontmatter(raw: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (match === null) return {}
  const scalars: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (entry !== null) {
      const [, key, value] = entry
      scalars[key] = value.trim().replace(/^["']|["']$/g, '')
    }
  }
  return { name: scalars.name, description: scalars.description }
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .map((entry) => {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          return entry.name.replace(/\.md$/, '')
        }
        if (entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md'))) {
          return entry.name
        }
        return undefined
      })
      .filter((name): name is string => name !== undefined)
  } catch {
    return []
  }
}

function listSkillSummaries(dir: string): { summaries: SkillSummary[]; errors: string[] } {
  const summaries: SkillSummary[] = []
  const errors: string[] = []
  const skillsDir = join(dir, 'skills')
  if (!existsSync(skillsDir)) return { summaries, errors }
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      const skillFile = entry.isDirectory()
        ? join(skillsDir, entry.name, 'SKILL.md')
        : join(skillsDir, entry.name)
      try {
        const raw = readFileSync(skillFile, 'utf-8')
        const frontmatter = parseFrontmatter(raw)
        summaries.push({
          name: frontmatter.name ?? entry.name.replace(/\.md$/, ''),
          description: frontmatter.description ?? '',
        })
      } catch (error) {
        errors.push(
          `skills/${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  } catch {
    // unreadable skills dir -> empty section
  }
  return { summaries, errors }
}

/** Inspect a plugin directory through the Phase-108 format and build a doc page. */
export function generatePluginDocs(
  pluginDir: string,
  options: { slug?: string } = {},
): PluginDocPage & { slug: string } {
  const errors: string[] = []
  let name = options.slug ?? pluginDir.split(/[\\/]/).pop() ?? 'plugin'
  let version = ''
  let description = ''

  try {
    const manifestPath = join(pluginDir, 'forge.plugin.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        name?: unknown
        version?: unknown
        description?: unknown
      }
      if (typeof manifest.name === 'string') name = manifest.name
      if (typeof manifest.version === 'string') version = manifest.version
      if (typeof manifest.description === 'string') description = manifest.description
    } else {
      errors.push('forge.plugin.json not found')
    }
  } catch (error) {
    errors.push(`manifest unreadable: ${error instanceof Error ? error.message : String(error)}`)
  }

  const skills = listSkillSummaries(pluginDir)
  errors.push(...skills.errors)

  const parts: Record<string, string[]> = {}
  for (const part of PLUGIN_DIRECTORIES) {
    if (part === 'skills') continue
    parts[part] = listMarkdownFiles(join(pluginDir, part))
  }

  return {
    slug: options.slug ?? name,
    plugin: { name, version },
    description,
    skills: skills.summaries,
    commands: parts.commands ?? [],
    hooks: parts.hooks ?? [],
    agents: parts.agents ?? [],
    mcpServers: parts.mcp ?? [],
    errors,
  }
}

function sectionList(title: string, items: string[]): string {
  if (items.length === 0) return ''
  return `<h2>${escapeHtml(title)}</h2>\n<ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`
}

/** Render one plugin's doc page as a standalone HTML document. */
export function renderPluginPageHtml(page: PluginDocPage): string {
  const skillsHtml =
    page.skills.length === 0
      ? ''
      : `<h2>Skills</h2>\n<ul>${page.skills
          .map(
            (skill) =>
              `<li><strong>${escapeHtml(skill.name)}</strong>${
                skill.description === '' ? '' : ` - ${escapeHtml(skill.description)}`
              }</li>`,
          )
          .join('')}</ul>`
  const errorsHtml =
    page.errors.length === 0 ? '' : `<p class="errors">${escapeHtml(page.errors.join('; '))}</p>`
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(page.plugin.name)} - forge plugin</title>`,
    '</head><body>',
    `<h1>${escapeHtml(page.plugin.name)} <small>v${escapeHtml(page.plugin.version)}</small></h1>`,
    `<p>${escapeHtml(page.description)}</p>`,
    skillsHtml,
    sectionList('Commands', page.commands),
    sectionList('Hooks', page.hooks),
    sectionList('Agents', page.agents),
    sectionList('MCP servers', page.mcpServers),
    errorsHtml,
    '</body></html>',
    '',
  ].join('\n')
}

/** Render a full site: an index over every plugin page + the pages themselves. */
export function renderDocsSite(entries: { slug: string; page: PluginDocPage }[]): PluginDocsSite {
  const pages = entries.map((entry) => ({
    slug: entry.slug,
    html: renderPluginPageHtml(entry.page),
  }))
  const items = entries
    .map(
      (entry) =>
        `<li><a href="${escapeHtml(entry.slug)}.html">${escapeHtml(entry.page.plugin.name)}</a>` +
        ` <small>v${escapeHtml(entry.page.plugin.version)}</small> - ${escapeHtml(entry.page.description)}</li>`,
    )
    .join('\n')
  const indexHtml = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<title>forge plugin marketplace docs</title>',
    '</head><body>',
    '<h1>forge plugin docs</h1>',
    `<ul>${items}</ul>`,
    '</body></html>',
    '',
  ].join('\n')
  return { pages, indexHtml }
}

/** Materialize the site into `outDir` (index.html + one file per plugin). */
export function writeDocsSite(
  site: PluginDocsSite,
  outDir: string,
): { ok: boolean; error?: string } {
  try {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'index.html'), site.indexHtml, 'utf-8')
    for (const page of site.pages) {
      writeFileSync(join(outDir, `${page.slug}.html`), page.html, 'utf-8')
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
