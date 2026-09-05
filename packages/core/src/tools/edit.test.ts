import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { editTool, createEditTool, EditSchema } from './edit'
import { ToolRegistry, createToolRegistryConfig } from './registry'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'forge-edit-test-' + Date.now())
const testFile = join(testDir, 'test.txt')

const originalContent = `function hello() {
  console.log("hello world");
  return 42;
}`

// Create tool with test directory as allowed path
const tool = createEditTool({ allowedPaths: [testDir] })

beforeEach(async () => {
  await mkdir(testDir, { recursive: true })
  await writeFile(testFile, originalContent)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('editTool', () => {
  it('replaces a single occurrence', async () => {
    const result = await tool.execute({
      path: testFile,
      old_str: 'console.log("hello world");',
      new_str: 'console.log("hello universe");',
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.replacements).toBe(1)

    const content = await readFile(testFile, 'utf-8')
    expect(content).toContain('hello universe')
    expect(content).not.toContain('hello world')
  })

  it('deletes text when new_str is empty', async () => {
    const result = await tool.execute({
      path: testFile,
      old_str: '  console.log("hello world");\n',
      new_str: '',
    })
    expect(result.success).toBe(true)

    const content = await readFile(testFile, 'utf-8')
    expect(content).not.toContain('hello world')
    expect(content).toBe(`function hello() {
  return 42;
}`)
  })

  it('throws when old_str not found', async () => {
    await expect(
      tool.execute({
        path: testFile,
        old_str: 'nonexistent',
        new_str: 'something',
      }),
    ).rejects.toThrow('old_str not found')
  })

  it('throws when old_str matches multiple times', async () => {
    await writeFile(testFile, 'foo\nfoo\nfoo')
    await expect(
      tool.execute({
        path: testFile,
        old_str: 'foo',
        new_str: 'bar',
      }),
    ).rejects.toThrow('matches 3 times')
  })

  it('replaces multi-line strings', async () => {
    const multiLineOld = `function hello() {
  console.log("hello world");
  return 42;
}`

    const multiLineNew = `function hello() {
  console.log("updated");
  return 100;
}`

    const result = await tool.execute({
      path: testFile,
      old_str: multiLineOld,
      new_str: multiLineNew,
    })
    expect(result.success).toBe(true)

    const content = await readFile(testFile, 'utf-8')
    expect(content).toContain('updated')
    expect(content).toContain('return 100')
  })

  it('throws on path outside allowed directory', async () => {
    await expect(
      tool.execute({
        path: '/etc/passwd',
        old_str: 'x',
        new_str: 'y',
      }),
    ).rejects.toThrow('Path not allowed')
  })

  it('allows path within allowed directory', async () => {
    // Use a unique string that only matches once
    const result = await tool.execute({
      path: testFile,
      old_str: 'function hello()',
      new_str: 'function world()',
    })
    expect(result.success).toBe(true)
  })

  it('throws on non-existent file', async () => {
    await expect(
      tool.execute({
        path: join(testDir, 'nonexistent.txt'),
        old_str: 'x',
        new_str: 'y',
      }),
    ).rejects.toThrow('File not found')
  })

  it('schema is valid TypeBox schema', () => {
    expect(EditSchema.type).toBe('object')
    expect(EditSchema.properties.path).toBeDefined()
    expect(EditSchema.properties.old_str).toBeDefined()
    expect(EditSchema.properties.new_str).toBeDefined()
  })
})

describe('editTool with registry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  it('executes through registry', async () => {
    const result = await registry.execute('edit', {
      path: testFile,
      old_str: 'hello world',
      new_str: 'registry test',
    })
    expect(result.success).toBe(true)

    const content = await readFile(testFile, 'utf-8')
    expect(content).toContain('registry test')
  })

  it('getDefinitions includes edit tool', () => {
    const defs = registry.getDefinitions()
    const editDef = defs.find((d) => d.name === 'edit')
    expect(editDef).toBeDefined()
    expect(editDef?.parameters).toBe(EditSchema)
  })
})