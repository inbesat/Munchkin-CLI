import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generatePluginDocs,
  renderDocsSite,
  renderPluginPageHtml,
  writeDocsSite,
} from './generator'

const MANIFEST = {
  name: 'deploy-helper',
  version: '1.2.0',
  description: 'Deployment helpers with rollback support',
}

const SKILL_MD = [
  '---',
  'name: deploy',
  'description: Run a pre-deploy checklist and deploy',
  'triggers:',
  '  - deploy now',
  '---',
  '',
  '## Deploy protocol',
  '',
  '1. Run the checklist.',
].join('\n')

describe('plugin docs generator (Phase 115)', () => {
  let pluginDir: string
  let outDir: string

  const setup = (): void => {
    pluginDir = mkdtempSync(join(tmpdir(), 'forge-docs-plugin-'))
    outDir = mkdtempSync(join(tmpdir(), 'forge-docs-out-'))
    writeFileSync(join(pluginDir, 'forge.plugin.json'), JSON.stringify(MANIFEST), 'utf-8')
    // skills/ (parsed frontmatter)
    mkdirSync(join(pluginDir, 'skills', 'deploy'), { recursive: true })
    writeFileSync(join(pluginDir, 'skills', 'deploy', 'SKILL.md'), SKILL_MD, 'utf-8')
    // commands/, hooks/, agents/, mcp/ (file listing)
    for (const dir of ['commands', 'hooks', 'agents', 'mcp']) {
      mkdirSync(join(pluginDir, dir), { recursive: true })
      writeFileSync(join(pluginDir, dir, `${dir}.md`), `# ${dir}\n`)
    }
  }

  const cleanup = (): void => {
    rmSync(pluginDir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
  }

  it('generates a doc page from a sample plugin with every component documented', () => {
    setup()
    try {
      const page = generatePluginDocs(pluginDir)
      expect(page.plugin.name).toBe('deploy-helper')
      expect(page.plugin.version).toBe('1.2.0')
      expect(page.description).toBe('Deployment helpers with rollback support')

      expect(page.skills.map((s) => s.name)).toEqual(['deploy'])
      expect(page.skills[0]?.description).toBe('Run a pre-deploy checklist and deploy')
      expect(page.commands).toEqual(['commands'])
      expect(page.hooks).toEqual(['hooks'])
      expect(page.agents).toEqual(['agents'])
      expect(page.mcpServers).toEqual(['mcp'])

      const html = renderPluginPageHtml(page)
      expect(html).toContain('deploy-helper')
      expect(html).toContain('rollback support')
      expect(html).toContain('pre-deploy checklist')
      expect(html).toContain('commands')
      expect(html).not.toContain('<script')
    } finally {
      cleanup()
    }
  })

  it('renders a site index linking every plugin page', () => {
    setup()
    try {
      const page = generatePluginDocs(pluginDir, { slug: 'deploy-helper' })
      const site = renderDocsSite([{ slug: 'deploy-helper', page }])
      expect(site.indexHtml).toContain('deploy-helper.html')

      const written = writeDocsSite(site, outDir)
      expect(written.ok).toBe(true)
      expect(existsSync(join(outDir, 'index.html'))).toBe(true)
      expect(existsSync(join(outDir, 'deploy-helper.html'))).toBe(true)
      const onPage = readFileSync(join(outDir, 'deploy-helper.html'), 'utf-8')
      expect(onPage).toContain('1.2.0')
    } finally {
      cleanup()
    }
  })

  it('tolerates a bare plugin with only a manifest (empty component sections)', () => {
    const bare = mkdtempSync(join(tmpdir(), 'forge-docs-bare-'))
    try {
      writeFileSync(
        join(bare, 'forge.plugin.json'),
        JSON.stringify({ name: 'minimal', version: '0.1.0', description: 'Minimal' }),
        'utf-8',
      )
      const page = generatePluginDocs(bare, { slug: 'minimal' })
      expect(page.skills).toEqual([])
      expect(page.commands).toEqual([])
      expect(page.hooks).toEqual([])
      expect(page.agents).toEqual([])
      expect(page.mcpServers).toEqual([])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})
