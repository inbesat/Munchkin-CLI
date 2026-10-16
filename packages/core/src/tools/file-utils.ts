import { realpathSync } from 'node:fs'
import path from 'node:path'
import { ErrorCode, ToolError } from '../errors'

/** Configuration for file access boundaries. */
export interface FileAccessConfig {
  /** Allowed root directories. Empty = allow all (dangerous). */
  allowedPaths: readonly string[]
  /** Whether to follow symlinks. */
  followSymlinks: boolean
}

/** Default config: allow current working directory and subdirectories. */
export function createDefaultFileAccessConfig(cwd: string = process.cwd()): FileAccessConfig {
  return {
    allowedPaths: [cwd],
    followSymlinks: false,
  }
}

/**
 * Canonical path that resolves symlinks/junctions in the deepest existing
 * ancestor, so boundary checks can't be escaped through a link.
 */
function canonicalizePath(target: string): string {
  const resolved = path.resolve(target)
  try {
    return realpathSync(resolved)
  } catch {
    const parent = path.dirname(resolved)
    if (parent === resolved) return resolved
    return path.join(canonicalizePath(parent), path.basename(resolved))
  }
}

/**
 * Validate that a file path is within allowed boundaries.
 * Throws ToolError if path is not allowed.
 */
export function validateFilePath(
  filePath: string,
  config: FileAccessConfig,
  operation: 'read' | 'write' | 'edit',
): string {
  // Canonicalize before comparison: a lexical prefix check can be escaped by
  // junctions or symlinks pointing outside the allowed roots.
  const normalized = canonicalizePath(filePath)

  // Check against allowed paths
  const isAllowed = config.allowedPaths.some((allowed) => {
    const allowedResolved = canonicalizePath(allowed)
    return normalized === allowedResolved || normalized.startsWith(allowedResolved + path.sep)
  })

  if (!isAllowed) {
    throw new ToolError(
      ErrorCode.TOOL_PERMISSION_DENIED,
      `Path not allowed for ${operation}: ${filePath}. Allowed roots: ${config.allowedPaths.join(', ')}`,
      'file',
    )
  }

  return normalized
}

/**
 * Read file contents with optional offset and limit.
 * Returns { content, lines, totalLines, truncated }.
 */
export async function readFileWithLines(
  filePath: string,
  options?: { offset?: number; limit?: number },
): Promise<{
  content: string
  lines: readonly string[]
  totalLines: number
  truncated: boolean
}> {
  const fullContent = await Bun.file(filePath).text()
  const allLines = fullContent.split('\n')
  const totalLines = allLines.length

  const offset = options?.offset ?? 0
  const limit = options?.limit ?? totalLines - offset

  if (offset < 0 || offset >= totalLines) {
    return { content: '', lines: [], totalLines, truncated: false }
  }

  const end = Math.min(offset + limit, totalLines)
  const lines = allLines.slice(offset, end)
  const truncated = end < totalLines

  // Add line numbers (1-indexed)
  const numberedLines = lines.map((line, i) => `${String(offset + i + 1).padStart(6)} | ${line}`)

  return {
    content: numberedLines.join('\n'),
    lines: numberedLines,
    totalLines,
    truncated,
  }
}

/**
 * Write file contents. Creates parent directories if needed.
 * Returns { success, path }.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<{ success: boolean; path: string }> {
  await Bun.write(filePath, content)
  return { success: true, path: filePath }
}

/**
 * str_replace edit: find exact match of old_str and replace with new_str.
 * Throws if old_str not found or matches multiple times.
 * Returns { success, path, replacements }.
 */
export async function strReplaceEdit(
  filePath: string,
  oldStr: string,
  newStr: string,
): Promise<{ success: boolean; path: string; replacements: number }> {
  const content = await Bun.file(filePath).text()

  // Count occurrences
  const occurrences = (content.match(new RegExp(escapeRegExp(oldStr), 'g')) || []).length

  if (occurrences === 0) {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      `str_replace: old_str not found in file: ${filePath}`,
      'edit',
    )
  }

  if (occurrences > 1) {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      `str_replace: old_str matches ${occurrences} times in file (must match exactly once): ${filePath}`,
      'edit',
    )
  }

  const newContent = content.replace(oldStr, () => newStr)
  await Bun.write(filePath, newContent)

  return { success: true, path: filePath, replacements: 1 }
}

/**
 * Escape string for use in RegExp.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await Bun.file(filePath).stat()
    return stat !== null
  } catch {
    return false
  }
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stat = await Bun.file(filePath).stat()
  return stat?.size ?? 0
}
