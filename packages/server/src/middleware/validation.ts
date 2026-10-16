import type { Context, Next } from 'hono'
import { z } from 'zod'

export function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  source: 'json' | 'query' | 'param' = 'json',
) {
  return async (c: Context, next: Next) => {
    try {
      let data: unknown
      switch (source) {
        case 'json':
          data = await c.req.json()
          break
        case 'query':
          data = c.req.query()
          break
        case 'param':
          data = c.req.param()
          break
      }
      const parsed = schema.parse(data)
      c.set('validatedData', parsed)
      return next()
    } catch (err) {
      if (err instanceof z.ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        }))
        return c.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details } },
          400,
        )
      }
      throw err
    }
  }
}

export const sessionCreateSchema = z.object({
  cwd: z.string().min(1),
  model: z.string().optional(),
  title: z.string().optional(),
  parentSessionId: z.string().optional(),
})

export const promptSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxIterations: z.number().int().positive().optional(),
})

export const toolExecuteSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.unknown()),
})

export const configSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})
