import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** One loaded rule file (a "single concern"). */
export interface LoadedRule {
  /** Absolute path. */
  path: string
  /** File name, e.g. `typescript-conventions.md`. */
  name: string
  /** File contents (utf-8). */
  content: string
  /** Rule file names that pulled this file in via `@import` (empty for top-level rules). */
  importedBy: string[]
}

export interface RuleLoadError {
  path: string
  reason: string
}

export interface LoadedRules {
  rules: LoadedRule[]
  errors: RuleLoadError[]
}

export interface LoadRulesOptions {
  /** Directory holding `*.md` rules, relative to `projectRoot`. Default: `.forge/rules`. */
  dir?: string
  /** Load only these top-level rule file names (plus anything they @import). */
  include?: readonly string[]
}

const RULES_SUBDIR = join('.forge', 'rules')
const IMPORT_PREFIX = '@import '

/** Extract the `@import ./x.md` target from a line, or null. */
function parseImportLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith(IMPORT_PREFIX)) return null
  const target = trimmed.slice(IMPORT_PREFIX.length).trim()
  return target.length > 0 ? target : null
}

/**
 * Load `@import` references for a rule file, depth-first, restricted to the
 * rules directory (path traversal is ignored). Cycles and duplicates are
 * collapsed via the visited set; unreadable targets are reported in errors.
 */
function loadWithImports(
  path: string,
  importedBy: string[],
  rulesDir: string,
  visited: Map<string, LoadedRule>,
  errors: RuleLoadError[],
): void {
  if (visited.has(path)) {
    visited.get(path)?.importedBy.push(...importedBy)
    return
  }

  let content: string
  try {
    content = readFileSync(path, 'utf-8')
  } catch (error) {
    errors.push({ path, reason: error instanceof Error ? error.message : 'unreadable' })
    return
  }

  const rule: LoadedRule = {
    path,
    name: basename(path),
    content,
    importedBy: [...importedBy],
  }
  // Insert before walking imports: cycle guards terminate on the visited check.
  visited.set(path, rule)

  for (const line of content.split('\n')) {
    const target = parseImportLine(line)
    if (!target) continue
    let importPath: string
    if (isAbsolute(target)) {
      importPath = resolve(target)
    } else {
      importPath = resolve(dirname(path), target)
    }
    if (!importPath.startsWith(rulesDir)) {
      errors.push({ path, reason: `@import escapes the rules directory: ${target}` })
      continue
    }
    if (!existsSync(importPath)) {
      errors.push({ path, reason: `@import target not found: ${target}` })
      continue
    }
    loadWithImports(importPath, [rule.name], rulesDir, visited, errors)
  }
}

/**
 * Load rules from `<projectRoot>/.forge/rules/*.md` (Phase 89). Each file is a
 * separate concern; `@import <target>` lines pull other rule files in
 * (deduplicated, cycle-safe). Files load sorted by name; `include` restricts
 * which top-level rules load (their imports still follow). Read problems are
 * reported instead of thrown.
 */
export function loadRules(projectRoot: string, options: LoadRulesOptions = {}): LoadedRules {
  const errors: RuleLoadError[] = []
  const rulesDir = resolve(projectRoot, options.dir ?? RULES_SUBDIR)

  if (!existsSync(rulesDir)) return { rules: [], errors }

  let entries: string[]
  try {
    entries = readdirSync(rulesDir, { withFileTypes: true }).map((e) => e.name)
  } catch (error) {
    errors.push({ path: rulesDir, reason: error instanceof Error ? error.message : 'unreadable' })
    return { rules: [], errors }
  }

  const files = entries
    .filter((name) => name.endsWith('.md'))
    .filter((name) => existsSync(join(rulesDir, name)))
    .sort()

  const include = options.include
  const wanted = include ? files.filter((name) => include.includes(name)) : files
  if (include) {
    for (const name of include) {
      if (!files.includes(name)) {
        errors.push({ path: join(rulesDir, name), reason: 'requested rule not found' })
      }
    }
  }

  const visited = new Map<string, LoadedRule>()
  for (const name of wanted) {
    loadWithImports(join(rulesDir, name), [], rulesDir, visited, errors)
  }

  // Map preserves insertion order: importers before their imports.
  return { rules: [...visited.values()], errors }
}
