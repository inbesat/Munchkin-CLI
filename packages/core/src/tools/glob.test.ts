import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { globTool, createGlobTool, GlobSchema } from './glob'
import { ToolRegistry, createToolRegistryConfig } from './registry'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'forge-glob-test-' + Date.now())

beforeEach(async () => {
  await mkdir(testDir, { recursive: true })
  await writeFile(join(testDir, 'a.ts'), 'export const a = 1')
  await writeFile(join(testDir, 'b.js'), 'export const b = 2')
  await writeFile(join(testDir, 'c.ts'), 'export const c = 3')
  await mkdir(join(testDir, 'sub'), { recursive: true })
  await writeFile(join(testDir, 'sub', 'd.ts'), 'export const d = 4')
  await writeFile(join(testDir, 'sub', 'e.jsx'), 'export const e = 5')
  await writeFile(join(testDir, 'README.md'), '# Test')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('globTool', () => {
  let tool: ReturnType<typeof createGlobTool>

  beforeEach(() => {
    tool = createGlobTool({ allowedPaths: [testDir] })
  })

  it('finds files matching pattern', async () => {
    const result = await tool.execute({ pattern: '*.ts', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(3)
    expect(result.metadata?.matches).toContain(join(testDir, 'a.ts'))
    expect(result.metadata?.matches).toContain(join(testDir, 'c.ts'))
  })

  it('finds files recursively with **', async () => {
    const result = await tool.execute({ pattern: '**/*.ts', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(3)
    expect(result.metadata?.matches).toContain(join(testDir, 'a.ts'))
    expect(result.metadata?.matches).toContain(join(testDir, 'c.ts'))
    expect(result.metadata?.matches).toContain(join(testDir, 'sub', 'd.ts'))
  })

  it('matches multiple extensions', async () => {
    const result = await tool.execute({ pattern: '*.{ts,js}', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(4)
  })

  it('respects custom search path', async () => {
    const result = await tool.execute({ pattern: '*.ts', path: join(testDir, 'sub') })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(1)
    expect(result.metadata?.matches[0]).toContain('d.ts')
  })

  it('case sensitive option', async () => {
    await writeFile(join(testDir, 'UPPER.TS'), 'upper')
    const result = await tool.execute({ pattern: '*.TS', caseSensitive: true, path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(1)
    expect(result.metadata?.matches[0]).toContain('UPPER.TS')
  })

  it('returns no matches for non-matching pattern', async () => {
    const result = await tool.execute({ pattern: '*.nonexistent', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(0)
    expect(result.output).toBe('(no matches)')
  })

  it('throws on path outside allowed directory', async () => {
    await expect(tool.execute({ pattern: '*', path: '/etc' })).rejects.toThrow('Path not allowed')
  })

  it('schema is valid', () => {
    expect(GlobSchema.type).toBe('object')
    expect(GlobSchema.properties.pattern).toBeDefined()
    expect(GlobSchema.properties.path).toBeDefined()
    expect(GlobSchema.properties.caseSensitive).toBeDefined()
  })
})

describe('globTool with registry', () => {
  let registry: ToolRegistry
  let tool: ReturnType<typeof createGlobTool>

  beforeEach(() => {
    tool = createGlobTool({ allowedPaths: [testDir] })
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('glob', { pattern: '*.ts', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(3)
  })

  it('getDefinitions includes glob tool', () => {
    const defs = registry.getDefinitions()
    const globDef = defs.find((d) => d.name === 'glob')
    expect(globDef).toBeDefined()
    expect(globDef?.parameters).toBe(GlobSchema)
  })
})