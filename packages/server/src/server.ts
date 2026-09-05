import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { SessionStore, Logger, getLogger, VERSION } from '@forge/core'
import { SessionManager } from './services/session-manager'
import { AgentExecutor } from './services/agent-executor'
import { SSEHub } from './services/sse-hub'
import { createModelResolver, type ModelResolver, type ModelResolverOptions } from './services/model-resolver'
import { createDefaultToolRegistry, toAgentTools } from './services/tool-registry'
import { AuthStore } from './auth/store'
import { createApiKeyRoutes } from './routes/api-keys'
import { SSEBridge } from './sse/bridge'
import {
  createCorsMiddleware,
  createLoggingMiddleware,
  createErrorHandlerMiddleware,
  createAuthMiddleware,
} from './middleware'
import {
  createSessionsRoutes,
  createPromptsRoutes,
  createToolsRoutes,
  createConfigRoutes,
  createSSERoutes,
  createAuthRoutes,
} from './routes'
import { generateOpenAPISpec, openAPIDocsHtml } from './openapi'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

export interface ServerOptions {
  port?: number
  host?: string
  baseDir?: string
  dbPath?: string
  corsOrigins?: string[]
  logger?: Logger
  modelResolverOptions?: ModelResolverOptions
  /** Inject a model resolver (used by tests to avoid real providers). */
  modelResolver?: ModelResolver
  /** Inject a model resolver that wraps the SSE bridge (tests). */
  sseBridge?: SSEBridge
  /** Pre-built agent executor (tests can inject a mock). */
  agentExecutor?: AgentExecutor
  /**
   * If set, every request must carry `Authorization: Bearer <authToken>`.
   * Applied as a top-level middleware. Phase 77 ships the basic check;
   * Phase 81 replaces this with the proper per-provider auth model.
   */
  authToken?: string
}

interface ResolvedServerOptions {
  port: number
  host: string
  baseDir: string
  dbPath: string
  corsOrigins: string[]
  logger: Logger
  modelResolverOptions: ModelResolverOptions
  modelResolver?: ModelResolver
  sseBridge?: SSEBridge
  agentExecutor?: AgentExecutor
  authToken?: string
}

export class ForgeServer {
  private app: Hono
  private sessionManager: SessionManager
  private agentExecutor: AgentExecutor
  private sseHub: SSEHub
  private sseBridge: SSEBridge
  private log: Logger
  private options: ResolvedServerOptions

  private authStore: AuthStore
  private constructor(deps: {
    options: ResolvedServerOptions
    sessionStore: SessionStore
    sessionManager: SessionManager
    agentExecutor: AgentExecutor
    sseHub: SSEHub
    sseBridge: SSEBridge
    authStore: AuthStore
  }) {
    this.options = deps.options
    this.sessionManager = deps.sessionManager
    this.agentExecutor = deps.agentExecutor
    this.sseHub = deps.sseHub
    this.sseBridge = deps.sseBridge
    this.authStore = deps.authStore
    this.log = deps.options.logger
    this.app = this.createApp()
  }

  static async create(options: ServerOptions = {}): Promise<ForgeServer> {
    const defaultBaseDir = path.join(process.cwd(), '.forge')
    const resolved: ResolvedServerOptions = {
      port: options.port ?? 3000,
      host: options.host ?? '127.0.0.1',
      baseDir: options.baseDir ?? defaultBaseDir,
      dbPath: options.dbPath ?? path.join(options.baseDir ?? defaultBaseDir, 'forge.db'),
      corsOrigins: options.corsOrigins ?? ['*'],
      logger: options.logger ?? getLogger(),
      modelResolverOptions: options.modelResolverOptions ?? {},
      modelResolver: options.modelResolver,
      agentExecutor: options.agentExecutor,
      authToken: options.authToken,
    }

    await fs.mkdir(resolved.baseDir, { recursive: true })
    await fs.mkdir(path.join(resolved.baseDir, 'sessions'), { recursive: true })
    await fs.mkdir(path.join(resolved.baseDir, 'logs'), { recursive: true })
    await fs.mkdir(path.join(resolved.baseDir, 'auth'), { recursive: true })

    const authStore = new AuthStore({
      baseDir: path.join(resolved.baseDir, 'auth'),
      logger: resolved.logger,
    })
    await authStore.load()

    const sessionStore = new SessionStore(resolved.dbPath, resolved.baseDir)
    const sessionManager = new SessionManager({
      store: sessionStore,
      baseDir: resolved.baseDir,
      logger: resolved.logger,
    })
    const sseHub = new SSEHub(resolved.logger)
    const sseBridge = resolved.sseBridge ?? new SSEBridge(sseHub)

    const agentExecutor =
      resolved.agentExecutor ??
      new AgentExecutor({
        baseDir: resolved.baseDir,
        modelResolver: resolved.modelResolver ?? createModelResolver(resolved.modelResolverOptions),
        tools: toAgentTools(createDefaultToolRegistry()),
        eventSink: sseBridge,
        logger: resolved.logger,
      })

    return new ForgeServer({
      options: resolved,
      sessionStore,
      sessionManager,
      agentExecutor,
      sseHub,
      sseBridge,
      authStore,
    })
  }

  private createApp(): Hono {
    const app = new Hono()

    app.use('*', createErrorHandlerMiddleware(this.log))
    app.use('*', createAuthMiddleware({
      legacyToken: this.options.authToken,
      store: this.authStore,
    }))
    app.use('*', createLoggingMiddleware(this.log))
    app.use('*', createCorsMiddleware(this.options.corsOrigins))

    const startTime = Date.now()
    app.get('/health', (c) => {
      return c.json({
        status: 'ok',
        version: VERSION,
        uptime: Date.now() - startTime,
        timestamp: Date.now(),
        services: {
          sessionStore: 'connected',
          sessionManager: 'ready',
          agentExecutor: 'ready',
        },
      })
    })
    app.get('/health/ready', (c) => {
      return c.json({ ready: true, checks: { sessionStore: true } }, 200)
    })

    app.route('/api/sessions', createSessionsRoutes(this.sessionManager))
    app.route('/api/prompts', createPromptsRoutes(this.agentExecutor, this.sessionManager, this.log))
    app.route('/api/tools', createToolsRoutes(this.log))
    app.route('/api/config', createConfigRoutes(this.log, this.options.baseDir))
    app.route('/api/sse', createSSERoutes(this.sseHub, this.sessionManager, this.log))
    app.route('/api/auth', createAuthRoutes(this.log))
    app.route('/api/auth', createApiKeyRoutes(this.authStore, this.log))

    const spec = generateOpenAPISpec()
    app.get('/api/openapi.json', (c) => c.json(spec))
    app.get('/docs', (c) => c.html(openAPIDocsHtml('/api/openapi.json')))

    app.notFound((c) => {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
    })

    app.onError((err, c) => {
      this.log.error('Unhandled error', err)
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
    })

    return app
  }

  async start(): Promise<void> {
    this.log.info('Starting Forge server', { port: this.options.port, host: this.options.host })

    serve({
      fetch: this.app.fetch,
      port: this.options.port,
      hostname: this.options.host,
    })

    this.log.info('Forge server running', { port: this.options.port })

    const shutdown = (signal: string) => {
      this.log.info('Shutting down', { signal })
      this.sessionManager.close()
      process.exit(0)
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    return new Promise<void>(() => {})
  }

  getApp(): Hono {
    return this.app
  }

  getSessionManager(): SessionManager {
    return this.sessionManager
  }

  getAgentExecutor(): AgentExecutor {
    return this.agentExecutor
  }

  getSSEHub(): SSEHub {
    return this.sseHub
  }

  getSSEBridge(): SSEBridge {
    return this.sseBridge
  }

  getAuthStore(): AuthStore {
    return this.authStore
  }

  /** Close open resources (session store). Safe to call multiple times. */
  close(): void {
    this.sessionManager.close()
  }
}

export async function createServer(options: ServerOptions = {}): Promise<ForgeServer> {
  return ForgeServer.create(options)
}
