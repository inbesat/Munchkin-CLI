import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/** One loaded memory file. */
export interface DiscoveredMemory {
  /** Absolute path of the file. */
  path: string
  /** Which convention produced it. */
  source: 'AGENTS.md' | 'CLAUDE.md' | '.forge/AGENTS.md' | '.claude/CLAUDE.md'
  /** File contents (utf-8). */
  content: string
}

export interface MemoryDiscoveryOptions {
  /** Include memory from directories containing this file (layered discovery). */
  forFile?: string
  /** Cap on directory levels walked above `projectRoot` (default 0 = root only). */
  maxParentLevels?: number
}

/**
 * Files checked per directory, in precedence order.
 * (Phase 88: AGENTS.md/CLAUDE.md at root, in `.forge/`, in `.claude/`, and nested.)
 */
const CANDIDATES: ReadonlyArray<{ file: string; source: DiscoveredMemory['source'] }> = [
  { file: 'AGENTS.md', source: 'AGENTS.md' },
  { file: 'CLAUDE.md', source: 'CLAUDE.md' },
  { file: join('.forge', 'AGENTS.md'), source: '.forge/AGENTS.md' },
  { file: join('.claude', 'CLAUDE.md'), source: '.claude/CLAUDE.md' },
]

function readDirMemories(dir: string): DiscoveredMemory[] {
  const found: DiscoveredMemory[] = []
  for (const candidate of CANDIDATES) {
    const path = join(dir, candidate.file)
    if (existsSync(path)) {
      found.push({ path, source: candidate.source, content: readFileSync(path, 'utf-8') })
    }
  }
  return found
}

/**
 * Discover memory files directory-layered: parent directories first (their
 * rules apply everywhere below), then descending toward `projectRoot` and —
 * when `forFile` is given — the file's own directory last (most specific).
 */
export function discoverMemoryFiles(
  projectRoot: string,
  options: MemoryDiscoveryOptions = {},
): DiscoveredMemory[] {
  const root = projectRoot
  const maxParents = options.maxParentLevels ?? 0
  const output: DiscoveredMemory[] = []
  const seen = new Set<string>()

  const chain: string[] = []
  let current = root
  for (let level = 0; level <= maxParents; level++) {
    chain.unshift(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  if (options.forFile) {
    const targetDir = dirname(options.forFile)
    const rel = relative(root, targetDir)
    if (!rel.startsWith('..') && targetDir !== root) {
      const segments = rel.split(/[\\/]/).filter(Boolean)
      let dir = root
      for (const segment of segments) {
        dir = join(dir, segment)
        chain.push(dir)
      }
    }
  }

  for (const dir of chain) {
    for (const memory of readDirMemories(dir)) {
      if (!seen.has(memory.path)) {
        seen.add(memory.path)
        output.push(memory)
      }
    }
  }
  return output
}
