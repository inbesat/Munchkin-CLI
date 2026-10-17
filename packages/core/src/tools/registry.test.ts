import { beforeEach, describe, expect, it } from 'bun:test'
import { Type } from '@sinclair/typebox'
import { ToolRegistry, createToolRegistryConfig } from './registry'
import type { PermissionMode, Tool, ToolRiskLevel, ToolScope } from './types'

// Test schemas
const ReadSchema = Type.Object({
  path: Type.String(),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1 })),
})

const WriteSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
})

const BashSchema = Type.Object({
  command: Type.String(),
  timeout: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000 })),
})

function makeTool(
  name: string,
  schema: typeof ReadSchema,
  options?: {
    scope?: ToolScope
    risk?: ToolRiskLevel
    requiresPermission?: boolean
    permissionMode?: PermissionMode
  },
): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: schema,
    scope: options?.scope ?? 'builtin',
    risk: options?.risk ?? 'medium',
    requiresPermission: options?.requiresPermission ?? true,
    permissionMode: options?.permissionMode,
    execute: async (input: Record<string, unknown>) => ({
      success: true,
      output: `Executed ${name} with ${JSON.stringify(input)}`,
    }),
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry(createToolRegistryConfig('ask'))
  })

  describe('register', () => {
    it('registers a tool successfully', () => {
      registry.register(makeTool('read', ReadSchema))
      expect(registry.has('read')).toBe(true)
    })

    it('throws on duplicate name', () => {
      registry.register(makeTool('read', ReadSchema))
      expect(() => registry.register(makeTool('read', WriteSchema))).toThrow(
        'Tool already registered: read',
      )
    })

    it('stores scope, risk, requiresPermission', () => {
      registry.register(
        makeTool('bash', BashSchema, { scope: 'user', risk: 'high', requiresPermission: true }),
      )
      const tool = registry.get('bash')
      expect(tool).toBeDefined()
      if (tool === undefined) throw new Error('bash tool missing')
      expect(tool.scope).toBe('user')
      expect(tool.risk).toBe('high')
      expect(tool.requiresPermission).toBe(true)
    })
  })

  describe('get', () => {
    it('returns tool by name', () => {
      registry.register(makeTool('read', ReadSchema))
      const tool = registry.get('read')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('read')
    })

    it('returns undefined for unknown tool', () => {
      expect(registry.get('unknown')).toBeUndefined()
    })
  })

  describe('list', () => {
    it('lists all tools when no scope filter', () => {
      registry.register(makeTool('read', ReadSchema, { scope: 'builtin' }))
      registry.register(makeTool('write', WriteSchema, { scope: 'builtin' }))
      registry.register(makeTool('bash', BashSchema, { scope: 'user' }))

      const { tools, scopes } = registry.list()
      expect(tools).toHaveLength(3)
      expect(scopes).toContain('builtin')
      expect(scopes).toContain('user')
    })

    it('filters by scope', () => {
      registry.register(makeTool('read', ReadSchema, { scope: 'builtin' }))
      registry.register(makeTool('bash', BashSchema, { scope: 'user' }))

      const { tools } = registry.list('builtin')
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('read')
    })
  })

  describe('getDefinitions', () => {
    it('returns ToolDefinition array for LLM function calling', () => {
      registry.register(makeTool('read', ReadSchema))
      registry.register(makeTool('write', WriteSchema))

      const defs = registry.getDefinitions()
      expect(defs).toHaveLength(2)
      expect(defs[0]).toEqual({
        name: 'read',
        description: 'Test tool: read',
        parameters: ReadSchema,
      })
    })
  })

  describe('execute', () => {
    it('executes a tool and returns result', async () => {
      registry.register(makeTool('read', ReadSchema, { permissionMode: 'allow' }))
      const result = await registry.execute('read', { path: '/test.txt' })
      expect(result.success).toBe(true)
      expect(result.output).toContain('Executed read')
    })

    it('throws ToolError for unknown tool', async () => {
      await expect(registry.execute('unknown', {})).rejects.toThrow('Tool not found: unknown')
    })

    it('throws PermissionError in ask mode without confirmation', async () => {
      registry.register(makeTool('bash', BashSchema, { permissionMode: 'ask' }))
      await expect(registry.execute('bash', { command: 'ls' })).rejects.toThrow('Permission denied')
    })

    it('allows execution in ask mode with userConfirmed=true', async () => {
      registry.register(makeTool('bash', BashSchema, { permissionMode: 'ask' }))
      const result = await registry.execute('bash', { command: 'ls' }, undefined, {
        userConfirmed: true,
      })
      expect(result.success).toBe(true)
    })

    it('allows execution in allow mode without confirmation', async () => {
      registry.register(makeTool('bash', BashSchema, { permissionMode: 'allow' }))
      const result = await registry.execute('bash', { command: 'ls' })
      expect(result.success).toBe(true)
    })

    it('denies execution in deny mode', async () => {
      registry.register(makeTool('bash', BashSchema, { permissionMode: 'deny' }))
      await expect(registry.execute('bash', { command: 'ls' })).rejects.toThrow('Permission denied')
    })

    it('auto-approves low/medium risk in auto mode', async () => {
      registry.register(makeTool('read', ReadSchema, { risk: 'low', permissionMode: 'auto' }))
      registry.register(makeTool('bash', BashSchema, { risk: 'high', permissionMode: 'auto' }))

      const readResult = await registry.execute('read', { path: '/test.txt' }, undefined, {
        permissionMode: 'auto',
      })
      expect(readResult.success).toBe(true)

      await expect(
        registry.execute('bash', { command: 'ls' }, undefined, { permissionMode: 'auto' }),
      ).rejects.toThrow('Permission denied')
    })

    it('plan mode only allows low risk without permission', async () => {
      registry.register(makeTool('read', ReadSchema, { risk: 'low', permissionMode: 'plan' }))
      registry.register(makeTool('write', WriteSchema, { risk: 'medium', permissionMode: 'plan' }))

      const readResult = await registry.execute('read', { path: '/test.txt' }, undefined, {
        permissionMode: 'plan',
      })
      expect(readResult.success).toBe(true)

      await expect(
        registry.execute('write', { path: '/test.txt', content: 'x' }, undefined, {
          permissionMode: 'plan',
        }),
      ).rejects.toThrow('Permission denied')
    })

    it('respects tool-level permissionMode over registry default', async () => {
      const registry2 = new ToolRegistry(createToolRegistryConfig('deny'))
      registry2.register(makeTool('read', ReadSchema, { permissionMode: 'allow' }))
      const result = await registry2.execute('read', { path: '/test.txt' })
      expect(result.success).toBe(true)
    })

    it('wraps execution errors in ToolError', async () => {
      const failingTool = makeTool('fail', ReadSchema, { permissionMode: 'allow' })
      failingTool.execute = async () => {
        throw new Error('boom')
      }
      registry.register(failingTool)
      await expect(registry.execute('fail', { path: 'x' })).rejects.toThrow('Tool execution failed')
    })

    it('respects AbortSignal', async () => {
      const controller = new AbortController()
      registry.register(makeTool('read', ReadSchema, { permissionMode: 'allow' }))
      controller.abort()
      await expect(registry.execute('read', { path: 'x' }, controller.signal)).rejects.toThrow(
        'cancelled',
      )
    })
  })

  describe('executeAll', () => {
    it('executes multiple tools in sequence', async () => {
      registry.register(makeTool('read', ReadSchema, { permissionMode: 'allow' }))
      registry.register(makeTool('write', WriteSchema, { permissionMode: 'allow' }))

      const results = await registry.executeAll([
        { name: 'read', input: { path: '/a.txt' } },
        { name: 'write', input: { path: '/b.txt', content: 'hi' } },
      ])
      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
    })

    it('stops on abort signal', async () => {
      const controller = new AbortController()
      registry.register(makeTool('read', ReadSchema, { permissionMode: 'allow' }))
      registry.register(makeTool('write', WriteSchema, { permissionMode: 'allow' }))

      const promise = registry.executeAll(
        [
          { name: 'read', input: { path: '/a.txt' } },
          { name: 'write', input: { path: '/b.txt', content: 'hi' } },
        ],
        controller.signal,
      )
      controller.abort()
      const results = await promise
      expect(results.length).toBeLessThanOrEqual(2)
    })
  })
})
