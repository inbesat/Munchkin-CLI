import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import {
  validateFilePath,
  createDefaultFileAccessConfig,
  FileAccessConfig,
} from './file-utils'
import { ToolError, ErrorCode } from '../errors'

/** Glob tool input schema. */
export const GlobSchema = Type.Object({
  pattern: Type.String({ description: 'Glob pattern to match (e.g., **/*.ts, src/**/*.test.ts)' }),
  path: Type.Optional(Type.String({ description: 'Root directory to search from (default: cwd)' })),
  caseSensitive: Type.Optional(Type.Boolean({ default: false, description: 'Case-sensitive matching' })),
})

/** Glob tool output metadata. */
export interface GlobResult extends ToolResult {
  metadata?: {
    matches: readonly string[]
    count: number
    searchPath: string
  }
}

/** Create the Glob tool with configurable file access. */
export function createGlobTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) {
    Object.assign(fileAccessConfig, config)
  }

  return {
    name: 'glob',
    description: 'Find files matching a glob pattern using ripgrep. Returns sorted list of matching file paths.',
    parameters: GlobSchema,
    scope: 'builtin',
    risk: 'low',
    requiresPermission: false,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<GlobResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Glob operation cancelled', 'glob')
      }

      const { pattern, path: searchPath, caseSensitive } = input as {
        pattern: string
        path?: string
        caseSensitive?: boolean
      }

      const basePath = searchPath ?? process.cwd()
      const validatedPath = validateFilePath(basePath, fileAccessConfig, 'read')

      // Use ripgrep's --files mode with --glob for pattern matching
      // rg --files --glob='pattern' <path>
      const args = ['--files', '--glob', pattern]
      if (caseSensitive) {
        args.push('--case-sensitive')
      }
      args.push(validatedPath)

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

        if (exitCode !== 0 && exitCode !== 1) {
          // exit code 1 = no matches (not an error)
          throw new ToolError(
            ErrorCode.TOOL_EXECUTION_FAILED,
            `Glob search failed: ${stderr || 'unknown error'}`,
            'glob',
          )
        }

        const matches = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .sort()

        return {
          success: true,
          output: matches.length > 0 ? matches.join('\n') : '(no matches)',
          metadata: {
            matches,
            count: matches.length,
            searchPath: validatedPath,
          },
        }
      } catch (err) {
        if (err instanceof ToolError) throw err
        throw new ToolError(
          ErrorCode.TOOL_EXECUTION_FAILED,
          `Glob search failed: ${err instanceof Error ? err.message : String(err)}`,
          'glob',
          { cause: err },
        )
      }
    },
  }
}

/** Default glob tool instance. */
export const globTool = createGlobTool()