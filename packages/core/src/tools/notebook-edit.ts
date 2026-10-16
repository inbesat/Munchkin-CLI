import { Type } from '@sinclair/typebox'
import { ErrorCode, ToolError } from '../errors'
import {
  type FileAccessConfig,
  createDefaultFileAccessConfig,
  fileExists,
  readFileWithLines,
  validateFilePath,
  writeFile,
} from './file-utils'
import type { Tool, ToolResult } from './types'

/** Notebook cell types. */
export type NotebookCellType = 'code' | 'markdown' | 'raw'

/** A notebook cell. */
export interface NotebookCell {
  cell_type: NotebookCellType
  source: string[]
  metadata: Record<string, unknown>
  outputs?: NotebookOutput[]
  execution_count?: number | null
}

/** A notebook output. */
export interface NotebookOutput {
  output_type: 'stream' | 'display_data' | 'execute_result' | 'error'
  name?: string
  text?: string[]
  data?: Record<string, string | string[]>
  metadata?: Record<string, unknown>
  ename?: string
  evalue?: string
  traceback?: string[]
}

/** A Jupyter notebook structure. */
export interface Notebook {
  cells: NotebookCell[]
  metadata: Record<string, unknown>
  nbformat: number
  nbformat_minor: number
}

/** Edit operation types. */
export type NotebookEditOperation =
  | { op: 'create'; cell_type: NotebookCellType; source: string | string[]; index?: number }
  | { op: 'edit'; index: number; source?: string | string[]; cell_type?: NotebookCellType }
  | { op: 'delete'; index: number }
  | { op: 'reorder'; fromIndex: number; toIndex: number }
  | { op: 'read' }

/** NotebookEdit input schema. */
export const NotebookEditSchema = Type.Object({
  path: Type.String({ description: 'Absolute path to the .ipynb file' }),
  operations: Type.Array(
    Type.Union([
      Type.Object({
        op: Type.Literal('create'),
        cell_type: Type.Union([
          Type.Literal('code'),
          Type.Literal('markdown'),
          Type.Literal('raw'),
        ]),
        source: Type.Union([Type.String(), Type.Array(Type.String())]),
        index: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
      Type.Object({
        op: Type.Literal('edit'),
        index: Type.Integer({ minimum: 0 }),
        source: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
        cell_type: Type.Optional(
          Type.Union([Type.Literal('code'), Type.Literal('markdown'), Type.Literal('raw')]),
        ),
      }),
      Type.Object({
        op: Type.Literal('delete'),
        index: Type.Integer({ minimum: 0 }),
      }),
      Type.Object({
        op: Type.Literal('reorder'),
        fromIndex: Type.Integer({ minimum: 0 }),
        toIndex: Type.Integer({ minimum: 0 }),
      }),
      Type.Object({
        op: Type.Literal('read'),
      }),
    ]),
    { minItems: 1 },
  ),
})

/** NotebookEdit output metadata. */
export interface NotebookEditResult extends ToolResult {
  metadata?: {
    path: string
    cellCount: number
    operations: Array<{ op: string; index?: number; success: boolean }>
  }
}

/** Normalize source to string array. */
function normalizeSource(source: string | string[]): string[] {
  if (typeof source === 'string') {
    return source.split('\n').map((line) => (line.endsWith('\n') ? line : line + '\n'))
  }
  return source.map((line) => (line.endsWith('\n') ? line : line + '\n'))
}

/** Create a new cell with defaults. */
function createCell(cell_type: NotebookCellType, source: string | string[]): NotebookCell {
  const base: NotebookCell = {
    cell_type,
    source: normalizeSource(source),
    metadata: {},
  }
  if (cell_type === 'code') {
    base.outputs = []
    base.execution_count = null
  }
  return base
}

/** Validate notebook structure. */
function validateNotebook(nb: unknown): Notebook {
  if (typeof nb !== 'object' || nb === null) {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      'Notebook is not a valid JSON object',
      'notebookEdit',
    )
  }
  const n = nb as Record<string, unknown>
  if (!Array.isArray(n.cells)) {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      'Notebook missing "cells" array',
      'notebookEdit',
    )
  }
  if (typeof n.nbformat !== 'number' || typeof n.nbformat_minor !== 'number') {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      'Notebook missing nbformat/nbformat_minor',
      'notebookEdit',
    )
  }
  return n as unknown as Notebook
}

/** Read notebook from file. */
async function readNotebook(path: string, config: FileAccessConfig): Promise<Notebook> {
  const validatedPath = validateFilePath(path, config, 'read')
  if (!(await fileExists(validatedPath))) {
    throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, `Notebook not found: ${path}`, 'notebookEdit')
  }
  const content = await readFileWithLines(validatedPath, { offset: 0, limit: 100000 })
  let parsed: unknown
  try {
    // content.lines includes line numbers, we need raw text
    // Use raw lines without line numbers
    const rawText = content.lines.map((line) => line.slice(line.indexOf('|') + 2)).join('\n')
    parsed = JSON.parse(rawText)
  } catch (e) {
    throw new ToolError(
      ErrorCode.TOOL_INVALID_INPUT,
      `Invalid JSON in notebook: ${e}`,
      'notebookEdit',
    )
  }
  return validateNotebook(parsed)
}

/** Write notebook to file. */
async function writeNotebook(
  path: string,
  notebook: Notebook,
  config: FileAccessConfig,
): Promise<void> {
  const validatedPath = validateFilePath(path, config, 'write')
  const json = JSON.stringify(notebook, null, 2)
  await writeFile(validatedPath, json)
}

/** Apply operations to a notebook. */
function applyOperations(
  notebook: Notebook,
  operations: NotebookEditOperation[],
): Array<{ op: string; index?: number; success: boolean }> {
  const results: Array<{ op: string; index?: number; success: boolean }> = []

  for (const operation of operations) {
    try {
      switch (operation.op) {
        case 'read': {
          results.push({ op: 'read', success: true })
          break
        }
        case 'create': {
          const index = operation.index ?? notebook.cells.length
          if (index < 0 || index > notebook.cells.length) {
            throw new Error(`Create index out of bounds: ${index}`)
          }
          const cell = createCell(operation.cell_type, operation.source)
          notebook.cells.splice(index, 0, cell)
          results.push({ op: 'create', index, success: true })
          break
        }
        case 'edit': {
          if (operation.index < 0 || operation.index >= notebook.cells.length) {
            throw new Error(`Edit index out of bounds: ${operation.index}`)
          }
          const cell = notebook.cells[operation.index]
          if (operation.source !== undefined) {
            cell.source = normalizeSource(operation.source)
          }
          if (operation.cell_type !== undefined) {
            cell.cell_type = operation.cell_type
            if (operation.cell_type === 'code') {
              cell.outputs = []
              cell.execution_count = null
            } else {
              delete cell.outputs
              delete cell.execution_count
            }
          }
          results.push({ op: 'edit', index: operation.index, success: true })
          break
        }
        case 'delete': {
          if (operation.index < 0 || operation.index >= notebook.cells.length) {
            throw new Error(`Delete index out of bounds: ${operation.index}`)
          }
          notebook.cells.splice(operation.index, 1)
          results.push({ op: 'delete', index: operation.index, success: true })
          break
        }
        case 'reorder': {
          if (operation.fromIndex < 0 || operation.fromIndex >= notebook.cells.length) {
            throw new Error(`Reorder fromIndex out of bounds: ${operation.fromIndex}`)
          }
          if (operation.toIndex < 0 || operation.toIndex > notebook.cells.length) {
            throw new Error(`Reorder toIndex out of bounds: ${operation.toIndex}`)
          }
          const [cell] = notebook.cells.splice(operation.fromIndex, 1)
          notebook.cells.splice(operation.toIndex, 0, cell)
          results.push({ op: 'reorder', index: operation.toIndex, success: true })
          break
        }
        default: {
          const _exhaustive: never = operation
          throw new Error(`Unknown operation: ${_exhaustive}`)
        }
      }
    } catch (e) {
      results.push({
        op: operation.op,
        index: 'index' in operation ? operation.index : undefined,
        success: false,
      })
      throw e
    }
  }
  return results
}

/** Create the NotebookEdit tool. */
export function createNotebookEditTool(config?: Partial<FileAccessConfig>): Tool {
  const fileAccessConfig = createDefaultFileAccessConfig()
  if (config) Object.assign(fileAccessConfig, config)

  return {
    name: 'notebookEdit',
    description:
      'Edit Jupyter notebooks (.ipynb). Supports creating, editing, deleting, and reordering cells. ' +
      'Operations are applied sequentially in a single transaction.',
    parameters: NotebookEditSchema,
    scope: 'builtin',
    risk: 'medium',
    requiresPermission: true,
    async execute(
      input: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<NotebookEditResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'NotebookEdit cancelled', 'notebookEdit')
      }

      const { path, operations } = input as { path: string; operations: NotebookEditOperation[] }

      // Read notebook
      const notebook = await readNotebook(path, fileAccessConfig)

      // Apply all operations (validates bounds, throws on error)
      const opResults = applyOperations(notebook, operations)

      // Write back
      await writeNotebook(path, notebook, fileAccessConfig)

      return {
        success: true,
        output: `Notebook updated: ${notebook.cells.length} cells`,
        metadata: {
          path,
          cellCount: notebook.cells.length,
          operations: opResults,
        },
      }
    },
  }
}

/** Default tool instance. */
export const notebookEditTool = createNotebookEditTool()
