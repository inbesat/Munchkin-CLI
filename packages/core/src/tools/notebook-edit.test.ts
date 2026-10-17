import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Notebook, NotebookEditSchema, createNotebookEditTool } from './notebook-edit'
import { ToolRegistry, createToolRegistryConfig } from './registry'

const TEST_DIR = join(__dirname, 'notebook-edit-test')
const TEST_NOTEBOOK = join(TEST_DIR, 'test.ipynb')

function createTestNotebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' },
    },
    cells: [
      { cell_type: 'markdown', source: ['# Test Notebook\n'], metadata: {} },
      {
        cell_type: 'code',
        source: ['print("hello")\n'],
        metadata: {},
        outputs: [],
        execution_count: 1,
      },
    ],
    ...overrides,
  }
}

function writeTestNotebook(nb: Notebook = createTestNotebook()) {
  writeFileSync(TEST_NOTEBOOK, JSON.stringify(nb, null, 2))
}

function readTestNotebook(): Notebook {
  return JSON.parse(require('node:fs').readFileSync(TEST_NOTEBOOK, 'utf8'))
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeTestNotebook()
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {}
})

describe('notebookEditTool', () => {
  let tool: ReturnType<typeof createNotebookEditTool>

  beforeEach(() => {
    tool = createNotebookEditTool()
  })

  it('reads notebook structure', async () => {
    const result = await tool.execute({ path: TEST_NOTEBOOK, operations: [{ op: 'read' }] })
    expect(result.success).toBe(true)
    expect(result.metadata?.cellCount).toBe(2)
  })

  it('creates a code cell at the end', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'create', cell_type: 'code', source: 'x = 42\nprint(x)' }],
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.cellCount).toBe(3)
    const nb = readTestNotebook()
    expect(nb.cells[2].cell_type).toBe('code')
    expect(nb.cells[2].source.join('')).toContain('x = 42')
  })

  it('creates a markdown cell at specific index', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'create', cell_type: 'markdown', source: '## New Section', index: 1 }],
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.cellCount).toBe(3)
    const nb = readTestNotebook()
    expect(nb.cells[1].cell_type).toBe('markdown')
    expect(nb.cells[1].source.join('')).toBe('## New Section\n')
  })

  it('creates a raw cell', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'create', cell_type: 'raw', source: 'raw content' }],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells[2].cell_type).toBe('raw')
    expect(nb.cells[2].source.join('')).toBe('raw content\n')
  })

  it('edits cell source', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'edit', index: 1, source: 'print("world")' }],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells[1].source.join('')).toBe('print("world")\n')
  })

  it('edits cell type', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'edit', index: 0, cell_type: 'code' }],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells[0].cell_type).toBe('code')
    expect(nb.cells[0].outputs).toEqual([])
    expect(nb.cells[0].execution_count).toBeNull()
  })

  it('edits both source and cell type', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'edit', index: 0, source: 'x = 1', cell_type: 'code' }],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells[0].cell_type).toBe('code')
    expect(nb.cells[0].source.join('')).toBe('x = 1\n')
  })

  it('deletes a cell', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'delete', index: 0 }],
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.cellCount).toBe(1)
    const nb = readTestNotebook()
    expect(nb.cells[0].source.join('')).toContain('print("hello")')
  })

  it('reorders cells', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'reorder', fromIndex: 1, toIndex: 0 }],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells[0].source.join('')).toContain('print("hello")')
    expect(nb.cells[1].source.join('')).toContain('# Test Notebook')
  })

  it('applies multiple operations in sequence', async () => {
    const result = await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [
        { op: 'create', cell_type: 'code', source: 'a = 1' },
        { op: 'create', cell_type: 'markdown', source: '# Middle', index: 1 },
        { op: 'edit', index: 2, source: 'b = 2' },
        { op: 'reorder', fromIndex: 3, toIndex: 0 },
        { op: 'delete', index: 2 },
      ],
    })
    expect(result.success).toBe(true)
    const nb = readTestNotebook()
    expect(nb.cells.length).toBe(3)
    expect(nb.cells[0].source.join('')).toContain('a = 1')
    expect(nb.cells[1].source.join('')).toContain('# Test Notebook')
    expect(nb.cells[2].source.join('')).toContain('b = 2')
  })

  it('rejects invalid create index', async () => {
    await expect(
      tool.execute({
        path: TEST_NOTEBOOK,
        operations: [{ op: 'create', cell_type: 'code', source: 'x', index: 999 }],
      }),
    ).rejects.toThrow('out of bounds')
  })

  it('rejects invalid edit index', async () => {
    await expect(
      tool.execute({ path: TEST_NOTEBOOK, operations: [{ op: 'edit', index: 999, source: 'x' }] }),
    ).rejects.toThrow('out of bounds')
  })

  it('rejects invalid delete index', async () => {
    await expect(
      tool.execute({ path: TEST_NOTEBOOK, operations: [{ op: 'delete', index: 999 }] }),
    ).rejects.toThrow('out of bounds')
  })

  it('rejects invalid reorder indices', async () => {
    await expect(
      tool.execute({
        path: TEST_NOTEBOOK,
        operations: [{ op: 'reorder', fromIndex: 0, toIndex: 999 }],
      }),
    ).rejects.toThrow('out of bounds')
  })

  it('rejects missing notebook file', async () => {
    await expect(
      tool.execute({ path: join(TEST_DIR, 'missing.ipynb'), operations: [{ op: 'read' }] }),
    ).rejects.toThrow('Notebook not found')
  })

  it('rejects invalid JSON', async () => {
    writeFileSync(join(TEST_DIR, 'bad.ipynb'), '{ not json }')
    await expect(
      tool.execute({ path: join(TEST_DIR, 'bad.ipynb'), operations: [{ op: 'read' }] }),
    ).rejects.toThrow('Invalid JSON')
  })

  it('rejects notebook missing cells array', async () => {
    writeFileSync(join(TEST_DIR, 'bad2.ipynb'), '{"metadata":{},"nbformat":4,"nbformat_minor":5}')
    await expect(
      tool.execute({ path: join(TEST_DIR, 'bad2.ipynb'), operations: [{ op: 'read' }] }),
    ).rejects.toThrow('missing "cells" array')
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      tool.execute({ path: TEST_NOTEBOOK, operations: [{ op: 'read' }] }, controller.signal),
    ).rejects.toThrow('cancelled')
  })

  it('normalizes source strings with newlines', async () => {
    await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'create', cell_type: 'code', source: 'line1\nline2\nline3' }],
    })
    const nb = readTestNotebook()
    expect(nb.cells[2].source).toEqual(['line1\n', 'line2\n', 'line3\n'])
  })

  it('preserves existing cell metadata on edit', async () => {
    writeTestNotebook(
      createTestNotebook({
        cells: [
          {
            cell_type: 'code',
            source: ['x=1\n'],
            metadata: { tags: ['important'] },
            outputs: [],
            execution_count: 1,
          },
        ],
      }),
    )
    await tool.execute({
      path: TEST_NOTEBOOK,
      operations: [{ op: 'edit', index: 0, source: 'y=2' }],
    })
    const nb = readTestNotebook()
    expect(nb.cells[0].metadata).toEqual({ tags: ['important'] })
  })
})

describe('NotebookEditSchema structure', () => {
  it('has required path property', () => {
    expect(NotebookEditSchema.properties.path).toBeDefined()
  })

  it('has required operations array', () => {
    expect(NotebookEditSchema.properties.operations).toBeDefined()
  })

  it('create operation has required fields', () => {
    const createOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'create',
    )
    expect(createOp).toBeDefined()
    expect(createOp.properties.cell_type).toBeDefined()
    expect(createOp.properties.source).toBeDefined()
  })

  it('edit operation has required index', () => {
    const editOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'edit',
    )
    expect(editOp).toBeDefined()
    expect(editOp.properties.index).toBeDefined()
  })

  it('delete operation has required index', () => {
    const deleteOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'delete',
    )
    expect(deleteOp).toBeDefined()
    expect(deleteOp.properties.index).toBeDefined()
  })

  it('reorder operation has fromIndex and toIndex', () => {
    const reorderOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'reorder',
    )
    expect(reorderOp).toBeDefined()
    expect(reorderOp.properties.fromIndex).toBeDefined()
    expect(reorderOp.properties.toIndex).toBeDefined()
  })

  it('read operation exists', () => {
    const readOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'read',
    )
    expect(readOp).toBeDefined()
  })

  it('cell_type enum includes code, markdown, raw', () => {
    const createOp = NotebookEditSchema.properties.operations.items.anyOf?.find(
      // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
      (o: any) => o.properties?.op?.const === 'create',
    )
    const cellTypeProp = createOp?.properties?.cell_type
    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
    const enumValues = cellTypeProp?.anyOf?.map((o: any) => o.const) ?? []
    expect(enumValues).toContain('code')
    expect(enumValues).toContain('markdown')
    expect(enumValues).toContain('raw')
  })
})

describe('notebookEditTool with registry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(createNotebookEditTool())
  })

  it('getDefinitions includes notebookEdit', () => {
    const defs = registry.getDefinitions()
    const ne = defs.find((d) => d.name === 'notebookEdit')
    expect(ne).toBeDefined()
    expect(ne?.parameters).toBe(NotebookEditSchema)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('notebookEdit', {
      path: TEST_NOTEBOOK,
      operations: [{ op: 'read' }],
    })
    expect(result.success).toBe(true)
  })
})
