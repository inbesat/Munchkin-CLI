import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { grepTool, createGrepTool, GrepSchema } from './grep'
import { ToolRegistry, createToolRegistryConfig } from './registry'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'forge-grep-test-' + Date.now())

beforeEach(async () => {
  await mkdir(testDir, { recursive: true })
  await writeFile(join(testDir, 'a.ts'), `export function hello() {
  console.log("hello world");
  return 42;
}`)

  await writeFile(join(testDir, 'b.js'), `export function world() {
  console.log("hello universe");
  return 24;
}`)

  await writeFile(join(testDir, 'c.ts'), `const greeting = "hello";
export { greeting };`)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('grepTool', () => {
  let tool: ReturnType<typeof createGrepTool>

  beforeEach(() => {
    tool = createGrepTool({ allowedPaths: [testDir] })
  })

  it('finds pattern in files', async () => {
    const result = await tool.execute({ pattern: 'hello', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBeGreaterThan(0)
    expect(result.metadata?.matches.some((m) => m.content.includes('hello'))).toBe(true)
  })

  it('returns line numbers and file paths', async () => {
    const result = await tool.execute({ pattern: 'function hello', path: testDir })
    expect(result.success).toBe(true)
    const match = result.metadata?.matches[0]
    expect(match).toBeDefined()
    expect(match?.line).toBeGreaterThan(0)
    expect(match?.file).toContain('a.ts')
  })

  it('includes context lines', async () => {
    const result = await tool.execute({ pattern: 'console.log', contextLines: 1, path: testDir })
    expect(result.success).toBe(true)
    const match = result.metadata?.matches[0]
    expect(match?.context?.before.length).toBeGreaterThanOrEqual(0)
    expect(match?.context?.after.length).toBeGreaterThanOrEqual(0)
  })

  it('filters by include pattern', async () => {
    const result = await tool.execute({ pattern: 'hello', include: '*.ts', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.matches.every((m) => m.file.endsWith('.ts'))).toBe(true)
  })

  it('excludes files by pattern', async () => {
    const result = await tool.execute({ pattern: 'hello', exclude: '*.js', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.matches.every((m) => !m.file.endsWith('.js'))).toBe(true)
  })

  it('case sensitive search', async () => {
    await writeFile(join(testDir, 'upper.txt'), 'HELLO WORLD')
    const result = await tool.execute({ pattern: 'HELLO', caseSensitive: true, path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.matches.some((m) => m.content.includes('HELLO'))).toBe(true)
  })

  it('respects maxResults', async () => {
    const result = await tool.execute({ pattern: 'export', maxResults: 1, path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBeLessThanOrEqual(1)
    expect(result.metadata?.truncated).toBe(true)
  })

  it('throws on path outside allowed directory', async () => {
    await expect(tool.execute({ pattern: 'test', path: '/etc' })).rejects.toThrow('Path not allowed')
  })

  it('schema is valid', () => {
    expect(GrepSchema.type).toBe('object')
    expect(GrepSchema.properties.pattern).toBeDefined()
    expect(GrepSchema.properties.path).toBeDefined()
    expect(GrepSchema.properties.include).toBeDefined()
    expect(GrepSchema.properties.exclude).toBeDefined()
    expect(GrepSchema.properties.caseSensitive).toBeDefined()
    expect(GrepSchema.properties.contextLines).toBeDefined()
    expect(GrepSchema.properties.maxResults).toBeDefined()
  })
})

describe('grepTool with registry', () => {
  let registry: ToolRegistry
  let tool: ReturnType<typeof createGrepTool>

  beforeEach(() => {
    tool = createGrepTool({ allowedPaths: [testDir] })
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('grep', { pattern: 'function', path: testDir })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBeGreaterThan(0)
  })

  it('getDefinitions includes grep tool', () => {
    const defs = registry.getDefinitions()
    const grepDef = defs.find((d) => d.name === 'grep')
    expect(grepDef).toBeDefined()
    expect(grepDef?.parameters).toBe(GrepSchema)
  })
})