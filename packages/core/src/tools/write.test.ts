import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdir, readFile, rm } from 'fs/promises'
import { ToolRegistry, createToolRegistryConfig } from './registry'
import { WriteSchema, createWriteTool } from './write'

const testDir = join(tmpdir(), 'forge-write-test-' + Date.now())
const newFile = join(testDir, 'new.txt')
const existingFile = join(testDir, 'existing.txt')

// Create tool with test directory as allowed path
const tool = createWriteTool({ allowedPaths: [testDir] })

beforeEach(async () => {
  await mkdir(testDir, { recursive: true })
  await Bun.write(existingFile, 'original content')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('writeTool', () => {
  it('creates a new file', async () => {
    const result = await tool.execute({ path: newFile, content: 'new content' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('created')
    expect(result.metadata?.created).toBe(true)
    expect(result.metadata?.fileSize).toBe('new content'.length)

    const content = await readFile(newFile, 'utf-8')
    expect(content).toBe('new content')
  })

  it('overwrites existing file', async () => {
    const result = await tool.execute({ path: existingFile, content: 'overwritten' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('overwritten')
    expect(result.metadata?.created).toBe(false)

    const content = await readFile(existingFile, 'utf-8')
    expect(content).toBe('overwritten')
  })

  it('writes empty content', async () => {
    const result = await tool.execute({ path: newFile, content: '' })
    expect(result.success).toBe(true)
    expect(result.metadata?.fileSize).toBe(0)

    const content = await readFile(newFile, 'utf-8')
    expect(content).toBe('')
  })

  it('writes unicode content', async () => {
    const unicode = 'Hello 世界 🌍 café'
    const result = await tool.execute({ path: newFile, content: unicode })
    expect(result.success).toBe(true)
    expect(result.metadata?.fileSize).toBe(Buffer.byteLength(unicode, 'utf8'))

    const content = await readFile(newFile, 'utf-8')
    expect(content).toBe(unicode)
  })

  it('throws on path outside allowed directory', async () => {
    await expect(tool.execute({ path: '/etc/passwd', content: 'x' })).rejects.toThrow(
      'Path not allowed',
    )
  })

  it('allows path within allowed directory', async () => {
    const result = await tool.execute({ path: newFile, content: 'allowed' })
    expect(result.success).toBe(true)
  })

  it('schema is valid TypeBox schema', () => {
    expect(WriteSchema.type).toBe('object')
    expect(WriteSchema.properties.path).toBeDefined()
    expect(WriteSchema.properties.content).toBeDefined()
  })
})

describe('writeTool with registry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('write', { path: newFile, content: 'registry test' })
    expect(result.success).toBe(true)

    const content = await readFile(newFile, 'utf-8')
    expect(content).toBe('registry test')
  })

  it('getDefinitions includes write tool', () => {
    const defs = registry.getDefinitions()
    const writeDef = defs.find((d) => d.name === 'write')
    expect(writeDef).toBeDefined()
    expect(writeDef?.parameters).toBe(WriteSchema)
  })
})
