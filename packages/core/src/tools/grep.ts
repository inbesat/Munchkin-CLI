import { Type } from '@sinclair/typebox'
import { ErrorCode, ToolError } from '../errors'
import {
  type FileAccessConfig,
  createDefaultFileAccessConfig,
  validateFilePath,
} from './file-utils'
import type { Tool, ToolResult } from './types'

/** Grep tool input schema. */
export const GrepSchema = Type.Object({
  pattern: Type.String({ description: 'Regular expression pattern to search for' }),
  path: Type.Optional(Type.String({ description: 'Root directory to search from (default: cwd)' })),
  include: Type.Optional(Type.String({ description: 'File pattern to include (e.g., *.ts)' })),
  exclude: Type.Optional(Type.String({ description: 'File pattern to exclude' })),
  caseSensitive: Type.Optional(
    Type.Boolean({ default: false, description: 'Case-sensitive search' }),
  ),
  contextLines: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: 10,
      default: 2,
      description: 'Context lines around matches',
    }),
  ),
  maxResults: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 10000,
      default: 500,
      description: 'Maximum number of matches to return',
    }),
  ),
})

/** Individual match result. */
export interface GrepMatch {
  file: string
  line: number
  content: string
  /** Context lines before/after the match. */
  context?: {
    before: string[]
    after: string[]
  }
}

/** Grep tool output metadata. */
export interface GrepResult extends ToolResult {
  metadata?: {
    matches: readonly GrepMatch[]
    count: number
    truncated: boolean
    searchPath: string
  }
}

/** Create the Grep tool with configurable file access. */
export function createGrepTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) {
    Object.assign(fileAccessConfig, config)
  }

  return {
    name: 'grep',
    description:
      'Search file contents using ripgrep regex. Returns matches with file paths, line numbers, and context.',
    parameters: GrepSchema,
    scope: 'builtin',
    risk: 'low',
    requiresPermission: false,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<GrepResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Grep operation cancelled', 'grep')
      }

      const {
        pattern,
        path: searchPath,
        include,
        exclude,
        caseSensitive,
        contextLines,
        maxResults,
      } = input as {
        pattern: string
        path?: string
        include?: string
        exclude?: string
        caseSensitive?: boolean
        contextLines?: number
        maxResults?: number
      }

      const basePath = searchPath ?? process.cwd()
      const validatedPath = validateFilePath(basePath, fileAccessConfig, 'read')

      // Build ripgrep arguments
      const args = [
        '--line-number',
        '--with-filename',
        '--color=never',
        '--heading',
        '--max-count',
        String(maxResults ?? 500),
        '--context',
        String(contextLines ?? 2),
      ]

      if (caseSensitive) {
        args.push('--case-sensitive')
      } else {
        args.push('--ignore-case')
      }

      if (include) {
        args.push('--glob', include)
      }
      if (exclude) {
        args.push('--glob', `!${exclude}`)
      }

      args.push('--', pattern, validatedPath)

      try {
        const proc = Bun.spawn(['rg', ...args], {
          cwd: validatedPath,
          stdout: 'pipe',
          stderr: 'pipe',
        })

        const [stdout, stderr] = await Promise.all([
          new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer()),
          new TextDecoder().decode(await new Response(proc.stderr).arrayBuffer()),
        ])

        const exitCode = await proc.exited

        // exit code 0 = matches found, 1 = no matches, 2 = error
        if (exitCode === 2) {
          throw new ToolError(
            ErrorCode.TOOL_EXECUTION_FAILED,
            `Grep search failed: ${stderr || 'unknown error'}`,
            'grep',
          )
        }

        const limit = maxResults ?? 500
        const parsed = parseGrepOutput(stdout)
        const truncated = parsed.length >= limit
        const finalMatches = parsed.slice(0, limit)

        return {
          success: true,
          output:
            finalMatches.length > 0 ? finalMatches.map(formatMatch).join('\n') : '(no matches)',
          metadata: {
            matches: finalMatches,
            count: finalMatches.length,
            truncated,
            searchPath: validatedPath,
          },
        }
      } catch (err) {
        if (err instanceof ToolError) throw err
        throw new ToolError(
          ErrorCode.TOOL_EXECUTION_FAILED,
          `Grep search failed: ${err instanceof Error ? err.message : String(err)}`,
          'grep',
          { cause: err },
        )
      }
    },
  }
}

/** Parse ripgrep output into structured matches. */
function parseGrepOutput(output: string): GrepMatch[] {
  const matches: GrepMatch[] = []
  const lines = output.split('\n')
  let currentFile = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === '') continue

    // File header (--heading prints the bare path line)
    if (!line.match(/^\d+[:-]/)) {
      currentFile = line
      continue
    }

    // Match line: "lineNum:content" or "lineNum-content" for context
    const match = line.match(/^(\d+)([:-])(.*)$/)
    if (match) {
      const lineNum = Number.parseInt(match[1], 10)
      const separator = match[2]
      const content = match[3]
      const isMatch = separator === ':' // ':' = match, '-' = context

      if (isMatch) {
        matches.push({
          file: currentFile,
          line: lineNum,
          content,
          context: { before: [], after: [] },
        })
      } else {
        // Context line - attach to most recent match
        const lastMatch = matches[matches.length - 1]
        if (lastMatch) {
          if (lineNum < lastMatch.line) {
            lastMatch.context?.before.push(content)
          } else {
            lastMatch.context?.after.push(content)
          }
        }
      }
    }
  }

  // Reverse context before arrays since we collected them in reverse order
  for (const match of matches) {
    if (match.context?.before) {
      match.context.before.reverse()
    }
  }

  return matches
}

/** Format a match for human-readable output. */
function formatMatch(match: GrepMatch): string {
  const loc = `${match.file}:${match.line}`
  let out = `${loc}: ${match.content}`
  const before = match.context?.before
  if (before !== undefined && before.length > 0) {
    out = `${before
      .map((l, i) => `${match.file}:${match.line - before.length + i}: ${l}`)
      .join('\n')}\n${out}`
  }
  const after = match.context?.after
  if (after !== undefined && after.length > 0) {
    out += `\n${after.map((l, i) => `${match.file}:${match.line + i + 1}: ${l}`).join('\n')}`
  }
  return out
}

/** Default grep tool instance. */
export const grepTool = createGrepTool()
