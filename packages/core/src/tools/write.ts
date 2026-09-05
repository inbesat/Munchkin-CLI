import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import {
  validateFilePath,
  writeFile,
  fileExists,
  createDefaultFileAccessConfig,
  FileAccessConfig,
} from './file-utils'
import { ToolError, ErrorCode } from '../errors'
import { recordFileRead } from './freshness'

/** Write tool input schema. */
export const WriteSchema = Type.Object({
  path: Type.String({ description: 'Absolute path to the file to write' }),
  content: Type.String({ description: 'Content to write to the file' }),
  sessionId: Type.Optional(Type.String({ description: 'Session ID for freshness tracking' })),
})

/** Write tool output metadata. */
export interface WriteResult extends ToolResult {
  metadata?: {
    fileSize: number
    created: boolean
  }
}

/** Create the Write tool with configurable file access. */
export function createWriteTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) {
    Object.assign(fileAccessConfig, config)
  }

  return {
    name: 'write',
    description: 'Create a new file or overwrite an existing file with the given content.',
    parameters: WriteSchema,
    scope: 'builtin',
    risk: 'medium',
    requiresPermission: true,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<WriteResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Write operation cancelled', 'write')
      }

      const { path: filePath, content, sessionId } = input as {
        path: string
        content: string
        sessionId?: string
      }

      const validatedPath = validateFilePath(filePath, fileAccessConfig, 'write')

      const existed = await fileExists(validatedPath)

      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Write operation cancelled', 'write')
      }

      await writeFile(validatedPath, content)

      const fileSize = Buffer.byteLength(content, 'utf8')

      // Update freshness record after write
      if (sessionId) {
        await recordFileRead(validatedPath, sessionId)
      }

      return {
        success: true,
        output: `File ${existed ? 'overwritten' : 'created'}: ${filePath}`,
        metadata: {
          fileSize,
          created: !existed,
        },
      }
    },
  }
}

/** Default write tool instance. */
export const writeTool = createWriteTool()