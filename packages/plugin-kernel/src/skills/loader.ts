import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Skills loader (Phase 106): read SKILL.md files from the project's
 * `.forge/skills/`, the user's `~/.config/forge/skills/`, and any plugin
 * skill directories. Precedence: project > home > plugin — on name
 * collision the higher-precedence source wins and the loser is reported.
 */

export type SkillSource = 'project' | 'home' | 'plugin'

export interface LoadedSkill {
  path: string
  name: string
  description: string
  triggers: string[]
  source: SkillSource
  /** Markdown body: the skill's instructions. */
  body: string
}

export interface SkillLoadError {
  path: string
  source: SkillSource
  reason: string
}

export interface LoadSkillsOptions {
  projectRoot: string
  /** Override for the user home dir (tests); default: os.homedir(). */
  homeDir?: string
  /** Extra (plugin) skill directories, lowest precedence. */
  pluginDirs?: readonly string[]
  /** Directory name inside each root. Default: `skills`. */
  dirName?: string
}

interface ParsedSkillFile {
  name?: string
  description?: string
  triggers: string[]
  body: string
}

/** Parse the `---` fenced frontmatter subset (same shape as agent definitions). */
function parseSkillFile(raw: string): ParsedSkillFile {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return { triggers: [], body: raw.trim() }
  const [, frontmatter, body] = match
  const scalars: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  let currentList: string | null = null
  for (const line of frontmatter.split(/\r?\n/)) {
    const item = /^\s*-\s+(.+)$/.exec(line)
    if (item && currentList) {
      lists[currentList].push(item[1].trim())
      continue
    }
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (!entry) continue
    const [, key, rawValue] = entry
    const inline = rawValue.trim()
    if (inline === '') {
      currentList = key
      lists[key] = []
      continue
    }
    currentList = null
    const inlineList = /^\[(.*)\]$/.exec(inline)
    if (inlineList) {
      lists[key] = inlineList[1]
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    } else {
      scalars[key] = inline.replace(/^["']|["']$/g, '')
    }
  }
  return {
    name: scalars.name,
    description: scalars.description,
    triggers: lists.triggers ?? [],
    body: body.trim(),
  }
}

function readSkillsFromDir(
  dir: string,
  source: SkillSource,
): {
  skills: LoadedSkill[]
  errors: SkillLoadError[]
} {
  const skills: LoadedSkill[] = []
  const errors: SkillLoadError[] = []
  if (!existsSync(dir)) return { skills, errors }

  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: () => e.isDirectory(),
    }))
  } catch (error) {
    errors.push({
      path: dir,
      source,
      reason: error instanceof Error ? error.message : 'unreadable',
    })
    return { skills, errors }
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry.name)
    let filePath: string
    if (entry.isDirectory()) {
      filePath = join(entryPath, 'SKILL.md')
    } else if (entry.name.endsWith('.md')) {
      filePath = entryPath
    } else {
      continue
    }
    try {
      const raw = readFileSync(filePath, 'utf-8')
      if (!/^---\r?\n/.test(raw)) {
        errors.push({ path: filePath, source, reason: 'missing frontmatter fences' })
        continue
      }
      const parsed = parseSkillFile(raw)
      const name = parsed.name ?? entry.name.replace(/\.md$/, '')
      skills.push({
        path: filePath,
        name,
        description: parsed.description ?? '',
        triggers: parsed.triggers,
        source,
        body: parsed.body,
      })
    } catch (error) {
      errors.push({
        path: filePath,
        source,
        reason: error instanceof Error ? error.message : 'unreadable',
      })
    }
  }
  return { skills, errors }
}

/** Load skills from project, home (~/.config/forge/skills), and plugin dirs. */
export function loadSkills(options: LoadSkillsOptions): {
  skills: LoadedSkill[]
  errors: SkillLoadError[]
} {
  const dirName = options.dirName ?? 'skills'
  const home = options.homeDir ?? homedir()
  const sources: ReadonlyArray<{ dir: string; source: SkillSource }> = [
    { dir: resolve(options.projectRoot, '.forge', dirName), source: 'project' },
    { dir: join(home, '.config', 'forge', dirName), source: 'home' },
    ...(options.pluginDirs ?? []).map((dir) => ({ dir: resolve(dir), source: 'plugin' as const })),
  ]

  const byName = new Map<string, LoadedSkill>()
  const errors: SkillLoadError[] = []
  for (const { dir, source } of sources) {
    const { skills: loaded, errors: sourceErrors } = readSkillsFromDir(dir, source)
    errors.push(...sourceErrors)
    for (const skill of loaded) {
      if (byName.has(skill.name)) {
        errors.push({
          path: skill.path,
          source,
          reason: `skill '${skill.name}' shadowed by higher-precedence source`,
        })
        continue
      }
      byName.set(skill.name, skill)
    }
  }
  return { skills: [...byName.values()], errors }
}
