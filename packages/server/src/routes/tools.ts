import { type Logger, getLogger } from '@forge/core'
import { Hono } from 'hono'
import { createValidationMiddleware, toolExecuteSchema } from '../middleware/validation'
import type { ToolExecuteRequest, ToolExecuteResponse } from '../types'

const availableTools: Record<
  string,
  { name: string; description: string; parameters: Record<string, unknown> }
> = {
  read: {
    name: 'read',
    description: 'Read a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  write: {
    name: 'write',
    description: 'Write a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  edit: {
    name: 'edit',
    description: 'Edit a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
    },
  },
  bash: {
    name: 'bash',
    description: 'Execute a bash command',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' }, cwd: { type: 'string' } },
      required: ['command'],
    },
  },
  glob: {
    name: 'glob',
    description: 'Glob pattern matching',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Search with ripgrep',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern'],
    },
  },
  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch a web page',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  web_search: {
    name: 'web_search',
    description: 'Search the web',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  todo: {
    name: 'todo',
    description: 'Manage todo list',
    parameters: {
      type: 'object',
      properties: { action: { type: 'string' }, items: { type: 'array' } },
      required: ['action'],
    },
  },
  notebook_edit: {
    name: 'notebook_edit',
    description: 'Edit a notebook',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, edits: { type: 'array' } },
      required: ['path'],
    },
  },
}

export function createToolsRoutes(logger?: Logger) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.get('/', (c) => {
    return c.json(Object.values(availableTools))
  })

  app.get('/:name', (c) => {
    const name = c.req.param('name')
    const tool = availableTools[name]
    if (!tool) {
      return c.json({ error: { code: 'TOOL_NOT_FOUND', message: `Tool ${name} not found` } }, 404)
    }
    return c.json(tool)
  })

  app.post('/execute', createValidationMiddleware(toolExecuteSchema), async (c) => {
    const data = c.get('validatedData') as ToolExecuteRequest
    const start = Date.now()

    log.info('Executing tool', { tool: data.name })

    try {
      let result: string
      switch (data.name) {
        case 'read': {
          const { readFileSync } = await import('node:fs')
          result = readFileSync(String(data.args.path), 'utf-8')
          break
        }
        case 'write': {
          const { writeFileSync, mkdirSync } = await import('node:fs')
          const { dirname } = await import('node:path')
          const filePath = String(data.args.path)
          mkdirSync(dirname(filePath), { recursive: true })
          writeFileSync(filePath, String(data.args.content), 'utf-8')
          result = `Wrote ${filePath}`
          break
        }
        case 'edit': {
          const { readFileSync, writeFileSync } = await import('node:fs')
          const filePath = String(data.args.path)
          const content = readFileSync(filePath, 'utf-8')
          const newContent = content.replace(String(data.args.oldText), String(data.args.newText))
          if (newContent === content) {
            return c.json<ToolExecuteResponse>({
              result: '',
              error: 'Old text not found',
              durationMs: Date.now() - start,
            })
          }
          writeFileSync(filePath, newContent, 'utf-8')
          result = `Edited ${filePath}`
          break
        }
        case 'bash': {
          // Run the command through a real shell: Bun's $ tag ESCAPES
          // interpolations, so `$`echo hello`` spawns a binary named
          // "echo hello" and fails with exit 1 on every platform.
          const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash'
          const flag = process.platform === 'win32' ? '/c' : '-c'
          const cmd = String(data.args.command)
          const cwd = data.args.cwd ? String(data.args.cwd) : process.cwd()
          const proc = Bun.spawn([shell, flag, cmd], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
          })
          const stdout = await new Response(proc.stdout).text()
          const code = await proc.exited
          if (code !== 0) {
            return c.json<ToolExecuteResponse>(
              {
                result: stdout,
                error: `Failed with exit code ${code}`,
                durationMs: Date.now() - start,
              },
              500,
            )
          }
          result = stdout
          break
        }
        case 'glob': {
          const { glob } = await import('node:fs/promises')
          const files: string[] = []
          for await (const f of glob(String(data.args.pattern))) {
            files.push(f)
          }
          result = files.join('\n')
          break
        }
        case 'grep': {
          const { $ } = await import('bun')
          const proc = await $`rg ${String(data.args.pattern)}`.quiet()
          result = proc.stdout.toString()
          break
        }
        case 'web_fetch': {
          const res = await fetch(String(data.args.url))
          result = await res.text()
          break
        }
        case 'web_search': {
          result = `Search results for: ${data.args.query} (not implemented)`
          break
        }
        case 'todo': {
          result = `Todo action: ${data.args.action}`
          break
        }
        case 'notebook_edit': {
          result = `Notebook edit: ${data.args.path}`
          break
        }
        default:
          return c.json<ToolExecuteResponse>(
            { result: '', error: `Unknown tool: ${data.name}`, durationMs: Date.now() - start },
            400,
          )
      }

      return c.json<ToolExecuteResponse>({ result, durationMs: Date.now() - start })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool execution failed'
      log.error('Tool execution failed', { tool: data.name, err, message })
      return c.json<ToolExecuteResponse>(
        { result: '', error: message, durationMs: Date.now() - start },
        500,
      )
    }
  })

  return app
}
