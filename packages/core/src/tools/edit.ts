import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import {
  validateFilePath,
  strReplaceEdit,
  fileExists,
  createDefaultFileAccessConfig,
  FileAccessConfig,
} from './file-utils'
import { ToolError, ErrorCode } from '../errors'
import { checkFreshnessBeforeEdit } from './freshness'

/** Edit tool input schema (str_replace pattern). */
export const EditSchema = Type.Object({
  path: Type.String({ description: 'Absolute path to the file to edit' }),
  old_str: Type.String({
    description: 'Exact string to find and replace. Must match exactly once in the file.',
    minLength: 1,
  }),
  new_str: Type.String({
    description: 'String to replace old_str with. Can be empty to delete.',
  }),
  sessionId: Type.Optional(Type.String({ description: 'Session ID for freshness tracking' })),
  blockOnStale: Type.Optional(Type.Boolean({ description: 'Block edit if file is stale', default: false })),
})

/** Edit tool output metadata. */
export interface EditResult extends ToolResult {
  metadata?: {
    replacements: number
    stale?: boolean
    warning?: string
  }
}

/** Create the Edit tool with configurable file access. */
export function createEditTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) {
    Object.assign(fileAccessConfig, config)
  }

  return {
    name: 'edit',
    description: 'Apply precise string replacement (str_replace) to a file. old_str must match exactly once.',
    parameters: EditSchema,
    scope: 'builtin',
    risk: 'high',
    requiresPermission: true,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<EditResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Edit operation cancelled', 'edit')
      }

      const { path: filePath, old_str, new_str, sessionId, blockOnStale } = input as {
        path: string
        old_str: string
        new_str: string
        sessionId?: string
        blockOnStale?: boolean
      }

      const validatedPath = validateFilePath(filePath, fileAccessConfig, 'edit')

      if (!(await fileExists(validatedPath))) {
        throw new ToolError(
          ErrorCode.TOOL_INVALID_INPUT,
          `File not found: ${filePath}`,
          'edit',
        )
      }

      // Check freshness if sessionId provided
      if (sessionId) {
        const warning = await checkFreshnessBeforeEdit(validatedPath, sessionId, { blockOnStale })
        if (warning && !blockOnStale) {
          return {
            success: false,
            error: `Stale file warning: ${warning}`,
            metadata: {
              replacements: 0,
              stale: true,
              warning,
            },
          }
        }
      }

      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Edit operation cancelled', 'edit')
      }

      const result = await strReplaceEdit(validatedPath, old_str, new_str)

      return {
        success: true,
        output: `Edited ${filePath}: replaced 1 occurrence`,
        metadata: {
          replacements: result.replacements,
        },
      }
    },
  }
}

/** Default edit tool instance. */
export const editTool = createEditTool()