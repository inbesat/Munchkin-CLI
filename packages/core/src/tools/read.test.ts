import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdir, rm, writeFile } from 'fs/promises'
import { ReadSchema, createReadTool } from './read'
import { ToolRegistry, createToolRegistryConfig } from './registry'

const testDir = join(tmpdir(), 'forge-read-test-' + Date.now())
const testFile = join(testDir, 'test.txt')
const multiLineFile = join(testDir, 'multiline.txt')

const multiLineContent = `line 1
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
line 10`

// Create tool with test directory as allowed path
const tool = createReadTool({ allowedPaths: [testDir] })

beforeEach(async () => {
  await mkdir(testDir, { recursive: true })
  await writeFile(testFile, 'hello world')
  await writeFile(multiLineFile, multiLineContent)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('readTool', () => {
  it('reads a simple file', async () => {
    const result = await tool.execute({ path: testFile })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello world')
    expect(result.metadata?.totalLines).toBe(1)
  })

  it('reads file with line numbers', async () => {
    const result = await tool.execute({ path: multiLineFile })
    expect(result.success).toBe(true)
    expect(result.output).toContain('1 | line 1')
    expect(result.output).toContain('10 | line 10')
    expect(result.metadata?.totalLines).toBe(10)
  })

  it('reads with offset', async () => {
    const result = await tool.execute({ path: multiLineFile, offset: 3 })
    expect(result.success).toBe(true)
    expect(result.output).toContain('4 | line 4')
    expect(result.output).not.toContain('1 | line 1')
    expect(result.metadata?.linesRead).toBe(7)
  })

  it('reads with limit', async () => {
    const result = await tool.execute({ path: multiLineFile, limit: 3 })
    expect(result.success).toBe(true)
    expect(result.output).toContain('1 | line 1')
    expect(result.output).toContain('3 | line 3')
    expect(result.output).not.toContain('4 | line 4')
    expect(result.metadata?.linesRead).toBe(3)
  })

  it('reads with offset and limit', async () => {
    const result = await tool.execute({ path: multiLineFile, offset: 2, limit: 3 })
    expect(result.success).toBe(true)
    expect(result.output).toContain('3 | line 3')
    expect(result.output).toContain('5 | line 5')
    expect(result.output).not.toContain('2 | line 2')
    expect(result.output).not.toContain('6 | line 6')
    expect(result.metadata?.linesRead).toBe(3)
  })

  it('returns truncated=true when more lines available', async () => {
    const result = await tool.execute({ path: multiLineFile, limit: 5 })
    expect(result.metadata?.truncated).toBe(true)
  })

  it('returns truncated=false when all lines read', async () => {
    const result = await tool.execute({ path: multiLineFile, limit: 10 })
    expect(result.metadata?.truncated).toBe(false)
  })

  it('throws on non-existent file', async () => {
    await expect(tool.execute({ path: join(testDir, 'nonexistent.txt') })).rejects.toThrow(
      'File not found',
    )
  })

  it('throws on path outside allowed directory', async () => {
    await expect(tool.execute({ path: '/etc/passwd' })).rejects.toThrow('Path not allowed')
  })

  it('allows path within allowed directory', async () => {
    const result = await tool.execute({ path: testFile })
    expect(result.success).toBe(true)
  })

  it('schema is valid TypeBox schema', () => {
    expect(ReadSchema.type).toBe('object')
    expect(ReadSchema.properties.path).toBeDefined()
    expect(ReadSchema.properties.offset).toBeDefined()
    expect(ReadSchema.properties.limit).toBeDefined()
  })
})

describe('readTool with registry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('read', { path: testFile })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello world')
  })

  it('getDefinitions includes read tool', () => {
    const defs = registry.getDefinitions()
    const readDef = defs.find((d) => d.name === 'read')
    expect(readDef).toBeDefined()
    expect(readDef?.parameters).toBe(ReadSchema)
  })
})
