import { describe, expect, it } from 'bun:test'
import {
  type CodeModeToolCall,
  buildCodeGenerationPrompt,
  capitalize,
  cleanProgram,
  generateArgsType,
  generateSDK,
  jsonSchemaToTS,
} from './code-mode'
import type { AgentTool } from './types'

const mockTools: readonly AgentTool[] = [
  {
    name: 'readFile',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
    execute: async (args) => `Content of ${args.path}`,
  },
  {
    name: 'grep',
    description: 'Search for pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['pattern'],
    },
    execute: async (args) => `Matches for ${args.pattern}`,
  },
  {
    name: 'listDir',
    description: 'List directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
    },
    execute: async (args) => ['file1.ts', 'file2.ts'],
  },
]

describe('code-mode utilities', () => {
  describe('capitalize', () => {
    it('capitalizes first letter', () => {
      expect(capitalize('readFile')).toBe('ReadFile')
      expect(capitalize('grep')).toBe('Grep')
      expect(capitalize('a')).toBe('A')
    })
  })

  describe('jsonSchemaToTS', () => {
    it('converts basic types', () => {
      expect(jsonSchemaToTS({ type: 'string' })).toBe('string')
      expect(jsonSchemaToTS({ type: 'number' })).toBe('number')
      expect(jsonSchemaToTS({ type: 'integer' })).toBe('number')
      expect(jsonSchemaToTS({ type: 'boolean' })).toBe('boolean')
    })

    it('converts arrays', () => {
      expect(jsonSchemaToTS({ type: 'array', items: { type: 'string' } })).toBe('Array<string>')
      expect(jsonSchemaToTS({ type: 'array', items: { type: 'number' } })).toBe('Array<number>')
    })

    it('converts objects', () => {
      expect(jsonSchemaToTS({ type: 'object' })).toBe('Record<string, unknown>')
    })

    it('defaults to unknown', () => {
      expect(jsonSchemaToTS({ type: 'unknown' })).toBe('unknown')
      expect(jsonSchemaToTS({})).toBe('unknown')
    })
  })

  describe('generateArgsType', () => {
    it('generates correct type for readFile', () => {
      const tool = {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      }
      const result = generateArgsType(tool)
      expect(result).toContain('path')
      expect(result).toContain('string')
    })

    it('handles optional properties', () => {
      const tool = {
        type: 'object',
        properties: {
          required: { type: 'string' },
          optional: { type: 'number' },
        },
        required: ['required'],
      }
      const result = generateArgsType(tool)
      expect(result).toContain('required')
      expect(result).toContain('optional?')
    })
  })

  describe('generateSDK', () => {
    it('generates SDK with tool definitions', () => {
      const sdk = generateSDK(mockTools)

      expect(sdk).toContain('readFile')
      expect(sdk).toContain('grep')
      expect(sdk).toContain('listDir')
      expect(sdk).toContain('toolRegistry')
      expect(sdk).toContain('executeReadFile')
      expect(sdk).toContain('executeGrep')
      expect(sdk).toContain('executeListDir')
      expect(sdk).toContain('async function main()')
    })

    it('includes type definitions when enabled', () => {
      const sdk = generateSDK(mockTools, true)
      expect(sdk).toContain('interface ToolResult')
      expect(sdk).toContain('interface ReadFileArgs')
      expect(sdk).toContain('interface GrepArgs')
    })

    it('excludes type definitions when disabled', () => {
      const sdk = generateSDK(mockTools, false)
      expect(sdk).not.toContain('interface ToolResult')
    })
  })

  describe('cleanProgram', () => {
    it('removes markdown code fences', () => {
      const input = '```typescript\nasync function main() { return 1 }\n```'
      expect(cleanProgram(input)).toBe('async function main() { return 1 }')
    })

    it('extracts main function', () => {
      const input = 'some text\nasync function main() { return 1 }\nmore text'
      expect(cleanProgram(input)).toBe('async function main() { return 1 }')
    })

    it('wraps body in main function', () => {
      const input = 'return "hello"'
      expect(cleanProgram(input)).toBe('async function main() {\nreturn "hello"\n}')
    })

    it('handles already clean program', () => {
      const input = 'async function main() { return 1 }'
      expect(cleanProgram(input)).toBe('async function main() { return 1 }')
    })
  })

  describe('buildCodeGenerationPrompt', () => {
    it('includes user prompt and tools', () => {
      const sdk = 'test sdk'
      const prompt = buildCodeGenerationPrompt('Find all TODO comments', mockTools, sdk)

      expect(prompt).toContain('Find all TODO comments')
      expect(prompt).toContain('readFile: Read a file')
      expect(prompt).toContain('grep: Search for pattern')
      expect(prompt).toContain('test sdk')
      expect(prompt).toContain('main()')
    })
  })
})

describe('CodeModeToolCall type', () => {
  it('accepts valid tool call', () => {
    const call: CodeModeToolCall = {
      name: 'readFile',
      args: { path: 'test.ts' },
      result: 'content',
      durationMs: 10,
    }
    expect(call.name).toBe('readFile')
    expect(call.args.path).toBe('test.ts')
  })

  it('accepts tool call with error', () => {
    const call: CodeModeToolCall = {
      name: 'fail',
      args: {},
      error: 'Something went wrong',
      durationMs: 5,
    }
    expect(call.error).toBe('Something went wrong')
  })
})
