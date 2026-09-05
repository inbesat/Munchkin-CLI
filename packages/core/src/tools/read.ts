import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import {
  validateFilePath,
  readFileWithLines,
  fileExists,
  getFileSize,
  createDefaultFileAccessConfig,
  FileAccessConfig,
} from './file-utils'
import { ToolError, ErrorCode } from '../errors'
import { recordFileRead } from './freshness'

/** Read tool input schema. */
export const ReadSchema = Type.Object({
  path: Type.String({ description: 'Absolute path to the file to read' }),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: 'Line offset (0-indexed)' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, description: 'Maximum number of lines to read' })),
  sessionId: Type.Optional(Type.String({ description: 'Session ID for freshness tracking' })),
})

/** Read tool output metadata. */
export interface ReadResult extends ToolResult {
  metadata?: {
    totalLines: number
    linesRead: number
    truncated: boolean
    fileSize: number
  }
}

/** Create the Read tool with configurable file access. */
export function createReadTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) {
    Object.assign(fileAccessConfig, config)
  }

  return {
    name: 'read',
    description: 'Read file contents with line numbers. Supports offset and limit for large files.',
    parameters: ReadSchema,
    scope: 'builtin',
    risk: 'low',
    requiresPermission: false,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<ReadResult> {
      // Check abort signal
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Read operation cancelled', 'read')
      }

      const { path: filePath, offset, limit, sessionId } = input as {
        path: string
        offset?: number
        limit?: number
        sessionId?: string
      }

      // Validate path
      const validatedPath = validateFilePath(filePath, fileAccessConfig, 'read')

      // Check file exists
      if (!(await fileExists(validatedPath))) {
        throw new ToolError(
          ErrorCode.TOOL_INVALID_INPUT,
          `File not found: ${filePath}`,
          'read',
        )
      }

      // Check abort signal again before reading
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Read operation cancelled', 'read')
      }

      // Read file with line numbers
      const { content, lines, totalLines, truncated } = await readFileWithLines(validatedPath, {
        offset,
        limit,
      })

      const fileSize = await getFileSize(validatedPath)

      // Record freshness if sessionId provided
      if (sessionId) {
        await recordFileRead(validatedPath, sessionId)
      }

      return {
        success: true,
        output: content,
        metadata: {
          totalLines,
          linesRead: lines.length,
          truncated,
          fileSize,
        },
      }
    },
  }
}

/** Default read tool instance. */
export const readTool = createReadTool()