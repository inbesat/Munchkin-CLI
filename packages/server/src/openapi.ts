import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { VERSION } from '@forge/core'
import {
  sessionCreateSchema,
  promptSchema,
  toolExecuteSchema,
  configSchema,
} from './middleware/validation'

// ── Response schemas ─────────────────────────────────────────────

const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

const sessionResponse = z.object({
  id: z.string(),
  title: z.string().optional(),
  model: z.string(),
  cwd: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  endedAt: z.number().optional(),
  eventCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
  status: z.enum(['active', 'completed']),
})

const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  total: z.number(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
})

const promptResponse = z.object({
  sessionId: z.string(),
  response: z.string(),
  usage: usageSchema,
  turns: z.number(),
  reason: z.string(),
  error: z.string().optional(),
})

const toolDef = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
})

const configResponse = z.object({
  key: z.string(),
  value: z.unknown(),
})

const authResponse = z.object({
  authenticated: z.boolean(),
  providers: z.record(z.string(), z.boolean()),
})

const sseStats = z.object({
  clients: z.number(),
  totalBroadcasts: z.number().optional(),
})

const healthResponse = z.object({
  status: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.number(),
  services: z.object({
    sessionStore: z.string(),
    sessionManager: z.string(),
    agentExecutor: z.string(),
  }),
})

const okResponse = z.object({ success: z.boolean() })
const readyResponse = z.object({ ready: z.boolean(), checks: z.record(z.string(), z.boolean()) })

// ── Spec app (routes registered only to drive OpenAPI generation) ─

/**
 * Builds an OpenAPIHono whose routes mirror the real server routes. The handlers
 * are stubs (the live traffic is served by the plain Hono routes in `routes/`);
 * this app exists purely so `getOpenAPIDocument()` can emit a 3.1 spec.
 */
export function buildSpecApp(): OpenAPIHono {
  const app = new OpenAPIHono()

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['system'],
      summary: 'Liveness probe',
      responses: { 200: { description: 'Server is alive', content: { 'application/json': { schema: healthResponse } } } },
    }),
    (c) =>
      c.json(
        {
          status: 'ok',
          version: VERSION,
          uptime: 0,
          timestamp: Date.now(),
          services: { sessionStore: 'connected', sessionManager: 'ready', agentExecutor: 'ready' },
        } satisfies z.infer<typeof healthResponse>,
        200,
      ),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health/ready',
      tags: ['system'],
      summary: 'Readiness probe',
      responses: {
        200: {
          description: 'Server ready',
          content: { 'application/json': { schema: z.object({ ready: z.boolean(), checks: z.record(z.string(), z.boolean()) }) } },
        },
        503: { description: 'Not ready', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({ ready: true, checks: { sessionStore: true } } satisfies z.infer<typeof readyResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sessions',
      tags: ['sessions'],
      summary: 'List recent sessions',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.array(sessionResponse) } } } },
    }),
    (c) => c.json([] as z.infer<typeof sessionResponse>[], 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/sessions',
      tags: ['sessions'],
      summary: 'Create a session',
      request: { body: { required: true, content: { 'application/json': { schema: sessionCreateSchema } } } },
      responses: {
        201: { description: 'created', content: { 'application/json': { schema: sessionResponse } } },
        400: { description: 'validation error', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof sessionResponse>, 201),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sessions/{id}',
      tags: ['sessions'],
      summary: 'Get a session',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: sessionResponse } } },
        404: { description: 'not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof sessionResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/sessions/{id}',
      tags: ['sessions'],
      summary: 'Delete a session',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { description: 'deleted', content: { 'application/json': { schema: okResponse } } },
        404: { description: 'not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({ success: true } satisfies z.infer<typeof okResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sessions/{id}/events',
      tags: ['sessions'],
      summary: 'Replay a session event log',
      request: { params: z.object({ id: z.string() }), query: z.object({ from: z.string().optional() }) },
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.array(z.record(z.string(), z.unknown())) } } } },
    }),
    (c) => c.json([] as Record<string, unknown>[], 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sessions/search',
      tags: ['sessions'],
      summary: 'Search sessions',
      request: { query: z.object({ q: z.string().optional() }) },
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.array(sessionResponse) } } } },
    }),
    (c) => c.json([] as z.infer<typeof sessionResponse>[], 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/prompts/{sessionId}',
      tags: ['prompts'],
      summary: 'Submit a prompt (runs the agent loop)',
      request: {
        params: z.object({ sessionId: z.string() }),
        body: { required: true, content: { 'application/json': { schema: promptSchema } } },
      },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: promptResponse } } },
        404: { description: 'session not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof promptResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/tools',
      tags: ['tools'],
      summary: 'List available tools',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.array(toolDef) } } } },
    }),
    (c) => c.json([] as z.infer<typeof toolDef>[], 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/tools/{name}',
      tags: ['tools'],
      summary: 'Inspect a tool',
      request: { params: z.object({ name: z.string() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: toolDef } } },
        404: { description: 'not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof toolDef>, 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/tools/execute',
      tags: ['tools'],
      summary: 'Execute a tool directly',
      request: { body: { required: true, content: { 'application/json': { schema: toolExecuteSchema } } } },
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: z.object({ result: z.string(), error: z.string().optional(), durationMs: z.number() }),
            },
          },
        },
        400: { description: 'validation error', content: { 'application/json': { schema: errorResponse } } },
        500: { description: 'execution error', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({ result: '', durationMs: 0 } satisfies { result: string; error?: string; durationMs: number }, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/config',
      tags: ['config'],
      summary: 'Get the full merged config',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } } },
    }),
    (c) => c.json({} as Record<string, unknown>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/config/default',
      tags: ['config'],
      summary: 'Get the built-in default config',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } } },
    }),
    (c) => c.json({} as Record<string, unknown>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/config/{key}',
      tags: ['config'],
      summary: 'Get a config value by key',
      request: { params: z.object({ key: z.string() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: configResponse } } },
        404: { description: 'not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof configResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/config',
      tags: ['config'],
      summary: 'Set a config value',
      request: { body: { required: true, content: { 'application/json': { schema: configSchema } } } },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: configResponse } } },
        400: { description: 'validation error', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({} as z.infer<typeof configResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/config/{key}',
      tags: ['config'],
      summary: 'Delete a config value',
      request: { params: z.object({ key: z.string() }), query: z.object({ scope: z.string().optional() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: okResponse } } },
        404: { description: 'not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({ success: true } satisfies z.infer<typeof okResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/auth',
      tags: ['auth'],
      summary: 'Provider auth status (no secrets exposed)',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: authResponse } } } },
    }),
    (c) => c.json({ authenticated: false, providers: {} } satisfies z.infer<typeof authResponse>, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sse/stats',
      tags: ['sse'],
      summary: 'SSE hub stats',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: sseStats } } } },
    }),
    (c) => c.json({ clients: 0 } satisfies z.infer<typeof sseStats>, 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/sse/broadcast',
      tags: ['sse'],
      summary: 'Broadcast an event to SSE clients',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z.object({ sessionId: z.string().optional(), event: z.string(), data: z.unknown() }),
            },
          },
        },
      },
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.object({ delivered: z.number() }) } } } },
    }),
    (c) => c.json({ delivered: 0 } satisfies { delivered: number }, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sse/events',
      tags: ['sse'],
      summary: 'SSE stream of live server events',
      responses: { 200: { description: 'text/event-stream', content: { 'text/event-stream': { schema: z.string() } } } },
    }),
    (c) => c.text('', 200),
  )

  // ── Phase 78: multi-client session attach ─────────────────────

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/sse/sessions/{id}/attach',
      tags: ['sse'],
      summary: 'Attach a stream to a session (multi-client)',
      request: {
        params: z.object({ id: z.string() }),
        body: {
          required: true,
          content: { 'application/json': { schema: z.object({ clientId: z.string() }) } },
        },
      },
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: z.object({ sessionId: z.string(), clientId: z.string(), attached: z.boolean() }),
            },
          },
        },
        404: { description: 'client or session not found', content: { 'application/json': { schema: errorResponse } } },
      },
    }),
    (c) => c.json({ sessionId: '', clientId: '', attached: true }, 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/sse/sessions/{id}/detach',
      tags: ['sse'],
      summary: 'Detach a stream from a session',
      request: {
        params: z.object({ id: z.string() }),
        body: {
          required: true,
          content: { 'application/json': { schema: z.object({ clientId: z.string() }) } },
        },
      },
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: z.object({ sessionId: z.string(), clientId: z.string(), detached: z.boolean() }),
            },
          },
        },
      },
    }),
    (c) => c.json({ sessionId: '', clientId: '', detached: true }, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sse/sessions/{id}/presence',
      tags: ['sse'],
      summary: 'Clients currently watching a session',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: z.object({ sessionId: z.string(), clientCount: z.number(), clientIds: z.array(z.string()) }),
            },
          },
        },
      },
    }),
    (c) => c.json({ sessionId: '', clientCount: 0, clientIds: [] }, 200),
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/sse/sessions',
      tags: ['sse'],
      summary: 'Sessions with at least one attached client',
      responses: {
        200: {
          description: 'ok',
          content: { 'application/json': { schema: z.object({ activeSessions: z.array(z.string()) }) } },
        },
      },
    }),
    (c) => c.json({ activeSessions: [] as string[] }, 200),
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/sse/replay',
      tags: ['sse'],
      summary: 'Replay recent session events to attached clients',
      request: {
        body: {
          required: true,
          content: {
            'application/json': {
              schema: z.object({
                sessionId: z.string(),
                fromIndex: z.number().int().nonnegative().optional(),
                limit: z.number().int().positive().optional(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: 'ok',
          content: {
            'application/json': {
              schema: z.object({
                sessionId: z.string(),
                fromIndex: z.number(),
                delivered: z.number(),
                count: z.number(),
                nextIndex: z.number(),
              }),
            },
          },
        },
      },
    }),
    (c) =>
      c.json(
        { sessionId: '', fromIndex: 0, delivered: 0, count: 0, nextIndex: 0 } satisfies {
          sessionId: string
          fromIndex: number
          delivered: number
          count: number
          nextIndex: number
        },
        200,
      ),
  )

  return app
}

/** Generate the OpenAPI 3.1 document describing the Forge server. */
export function generateOpenAPISpec(): ReturnType<OpenAPIHono['getOpenAPIDocument']> {
  const app = buildSpecApp()
  return app.getOpenAPIDocument({
    openapi: '3.1.0',
    info: {
      title: 'Forge Server API',
      version: VERSION,
      description: 'HTTP API for the Forge coding agent server (sessions, prompts, tools, config, SSE).',
    },
    servers: [{ url: '/' }],
  })
}

/** Minimal Scalar-based API reference page (loaded from CDN). */
export function openAPIDocsHtml(specUrl = '/api/openapi.json'): string {
  return `<!doctype html>
<html>
  <head>
    <title>Forge Server API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="${specUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`
}
