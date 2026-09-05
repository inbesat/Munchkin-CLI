import { VERSION, getLogger, type Logger, type LoopEvent } from '@forge/core'
import { RpcServer, type RpcNotifier, type RpcDispatchRequest } from './server'
import { SessionManager } from '../services/session-manager'
import { AgentExecutor } from '../services/agent-executor'
import { SSEBridge } from '../sse/bridge'
import { AuthStore } from '../auth/store'
import {
  negotiate,
  type ServerCapabilities,
  type InitializeResult,
} from './capabilities'

/**
 * Phase 80: extended RPC surface.
 *
 * - `initialize` / `initialized` capability handshake (LSP-style)
 * - `$/cancelRequest` for in-flight prompt cancellation
 * - `prompts.submit` pushes live loop-event notifications before returning
 * - `sse.subscribe` returns a per-session id; `sse.unsubscribe` clears it
 *
 * Phase 81: `auth.*` methods mirror the HTTP API key management routes.
 */
export interface RpcBindingsOptions {
  sessionManager: SessionManager
  agentExecutor: AgentExecutor
  sseBridge?: SSEBridge
  authStore?: AuthStore
  logger?: Logger
}

const CORE_METHODS = [
  'system.health',
  'system.ready',
  'sessions.create',
  'sessions.list',
  'sessions.get',
  'sessions.delete',
  'sessions.search',
  'sessions.events',
  'prompts.submit',
  'prompts.cancel',
  'tools.list',
  'tools.get',
  'tools.execute',
  'config.all',
  'config.defaults',
  'sse.subscribe',
  'sse.unsubscribe',
  'auth.listKeys',
  'auth.createKey',
  'auth.revokeKey',
  'auth.usage',
  'initialize',
  '$/cancelRequest',
] as const

export interface RpcBindingsContext {
  serverInfo: { name: string; version: string }
  supportedMethods: string[]
  capabilities(): ServerCapabilities
}

interface SessionMetaLike {
  id: string
  title?: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  endedAt?: number
  eventCount: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  status?: 'active' | 'completed' | 'errored'
}

function toSessionResponse(s: SessionMetaLike): Record<string, unknown> {
  return {
    id: s.id,
    title: s.title,
    model: s.model,
    cwd: s.cwd,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    endedAt: s.endedAt,
    eventCount: s.eventCount,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    totalCost: s.totalCost,
    status: s.status ?? (s.endedAt ? 'completed' : 'active'),
  }
}

export function registerRpcMethods(server: RpcServer, opts: RpcBindingsOptions): RpcBindingsContext {
  const log = opts.logger ?? getLogger()
  const { sessionManager, agentExecutor } = opts

  const serverInfo = { name: 'forge', version: VERSION }
  const supportedMethods: string[] = [...CORE_METHODS]

  const subscriptions = new Map<string, { sessionIds: Set<string> }>()

  // Capability handshake

  server.register('initialize', (params) => {
    const p = (params ?? {}) as Parameters<typeof negotiate>[0]
    const result = negotiate(p, serverInfo, supportedMethods)
    log.info('rpc initialize', { client: p.clientInfo, protocol: result.protocolVersion })
    return result satisfies InitializeResult
  })

  // System

  server.register('system.health', () => ({
    status: 'ok',
    version: serverInfo.version,
    uptime: process.uptime(),
    timestamp: Date.now(),
  }))

  server.register('system.ready', () => ({ ready: true }))

  // Sessions

  server.register('sessions.create', async (params) => {
    const p = (params ?? {}) as { cwd?: string; model?: string; title?: string; parentSessionId?: string }
    if (!p.cwd) throw { code: -32602, message: 'cwd is required' }
    const session = await sessionManager.createSession(p.cwd, p.model ?? 'auto', p.title)
    return toSessionResponse(session as unknown as SessionMetaLike)
  })

  server.register('sessions.list', async (params) => {
    const p = (params ?? {}) as { limit?: number }
    const sessions = await sessionManager.listSessions(p.limit ?? 50)
    return sessions.map((s) => toSessionResponse(s as unknown as SessionMetaLike))
  })

  server.register('sessions.get', async (params) => {
    const p = params as { id: string }
    if (!p?.id) throw { code: -32602, message: 'id is required' }
    const s = await sessionManager.getSession(p.id)
    if (!s) throw { code: -32004, message: 'Session not found' }
    return toSessionResponse(s as unknown as SessionMetaLike)
  })

  server.register('sessions.delete', async (params) => {
    const p = params as { id: string }
    if (!p?.id) throw { code: -32602, message: 'id is required' }
    const ok = await sessionManager.deleteSession(p.id)
    if (!ok) throw { code: -32004, message: 'Session not found' }
    return { success: true }
  })

  server.register('sessions.search', async (params) => {
    const p = (params ?? {}) as { q?: string }
    const sessions = await sessionManager.searchSessions(p.q ?? '')
    return sessions.map((s) => toSessionResponse(s as unknown as SessionMetaLike))
  })

  server.register('sessions.events', async (params) => {
    const p = params as { id: string; fromIndex?: number }
    if (!p?.id) throw { code: -32602, message: 'id is required' }
    return await sessionManager.getEvents(p.id, p.fromIndex)
  })

  // Prompts

  server.register('prompts.submit', async (params, req: RpcDispatchRequest) => {
    const p = params as { sessionId: string; prompt: string; model?: string; systemPrompt?: string; tools?: string[]; maxIterations?: number }
    if (!p?.sessionId) throw { code: -32602, message: 'sessionId is required' }
    if (!p?.prompt) throw { code: -32602, message: 'prompt is required' }
    const session = await sessionManager.getSession(p.sessionId)
    if (!session) throw { code: -32004, message: 'Session not found' }

    const notifier: RpcNotifier | undefined = (method, params) => {
      server.notify(`$/progress`, { requestId: req.id, method, params })
    }

    const result = await agentExecutor.executePrompt(
      p.sessionId,
      p.prompt,
      {
        modelId: p.model,
        systemPrompt: p.systemPrompt,
        tools: p.tools,
        maxIterations: p.maxIterations,
        abortSignal: req.signal,
      },
      notifier
        ? (event: LoopEvent) => notifier(loopEventToRpcMethod(event), event)
        : undefined,
    )

    return {
      sessionId: p.sessionId,
      response: result.response,
      usage: result.usage,
      turns: result.turns,
      reason: result.reason,
      error: result.error instanceof Error
        ? result.error.message
        : result.error
          ? String(result.error)
          : undefined,
    }
  })

  server.register('prompts.cancel', () => ({ ok: true }))

  // Tools

  const TOOL_CATALOG = [
    { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'write', description: 'Write a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'edit', description: 'Edit a file', parameters: { type: 'object', properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['path', 'oldText', 'newText'] } },
    { name: 'bash', description: 'Execute a bash command', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
    { name: 'glob', description: 'Glob pattern matching', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
    { name: 'grep', description: 'Search with ripgrep', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
    { name: 'web_fetch', description: 'Fetch a web page', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'todo', description: 'Manage todo list', parameters: { type: 'object', properties: { action: { type: 'string' }, items: { type: 'array' } }, required: ['action'] } },
    { name: 'notebook_edit', description: 'Edit a notebook', parameters: { type: 'object', properties: { path: { type: 'string' }, edits: { type: 'array' } }, required: ['path'] } },
  ] as const

  server.register('tools.list', () => TOOL_CATALOG)

  server.register('tools.get', (params) => {
    const p = params as { name: string }
    if (!p?.name) throw { code: -32602, message: 'name is required' }
    const found = TOOL_CATALOG.find((t) => t.name === p.name)
    if (!found) throw { code: -32004, message: `Tool not found: ${p.name}` }
    return found
  })

  server.register('tools.execute', async (params) => {
    const p = params as { name: string; args: Record<string, unknown> }
    if (!p?.name) throw { code: -32602, message: 'name is required' }
    const start = Date.now()
    try {
      let result = ''
      switch (p.name) {
        case 'read': {
          const { readFileSync } = await import('node:fs')
          result = readFileSync(String(p.args.path), 'utf-8')
          break
        }
        case 'write': {
          const { writeFileSync, mkdirSync } = await import('node:fs')
          const { dirname } = await import('node:path')
          const filePath = String(p.args.path)
          mkdirSync(dirname(filePath), { recursive: true })
          writeFileSync(filePath, String(p.args.content), 'utf-8')
          result = `Wrote ${filePath}`
          break
        }
        case 'edit': {
          const { readFileSync, writeFileSync } = await import('node:fs')
          const filePath = String(p.args.path)
          const content = readFileSync(filePath, 'utf-8')
          const newContent = content.replace(String(p.args.oldText), String(p.args.newText))
          if (newContent === content) {
            return { result: '', error: 'Old text not found', durationMs: Date.now() - start }
          }
          writeFileSync(filePath, newContent, 'utf-8')
          result = `Edited ${filePath}`
          break
        }
        case 'bash': {
          const { $ } = await import('bun')
          const cmd = String(p.args.command)
          const cwd = p.args.cwd ? String(p.args.cwd) : process.cwd()
          const proc = await $`${cmd}`.cwd(cwd).quiet()
          result = proc.stdout.toString()
          break
        }
        case 'glob': {
          const { glob } = await import('node:fs/promises')
          const files: string[] = []
          for await (const f of glob(String(p.args.pattern))) {
            files.push(f)
          }
          result = files.join('\n')
          break
        }
        case 'grep': {
          const { $ } = await import('bun')
          const proc = await $`rg ${String(p.args.pattern)}`.quiet()
          result = proc.stdout.toString()
          break
        }
        case 'web_fetch': {
          const res = await fetch(String(p.args.url))
          result = await res.text()
          break
        }
        default:
          return { result: '', error: `Unknown tool: ${p.name}`, durationMs: Date.now() - start }
      }
      return { result, durationMs: Date.now() - start }
    } catch (err) {
      return { result: '', error: err instanceof Error ? err.message : 'Tool failed', durationMs: Date.now() - start }
    }
  })

  // Config

  server.register('config.all', async () => {
    const { loadConfig } = await import('@forge/core')
    return (await loadConfig({ cwd: process.cwd() })).config
  })

  server.register('config.defaults', async () => {
    const { DEFAULT_CONFIG } = await import('@forge/core')
    return DEFAULT_CONFIG
  })

  // SSE over RPC

  server.register('sse.subscribe', (params) => {
    const p = (params ?? {}) as { clientId?: string; sessionIds?: string[] }
    const clientId = p.clientId ?? crypto.randomUUID()
    subscriptions.set(clientId, { sessionIds: new Set(p.sessionIds ?? []) })
    return { clientId, sessionIds: p.sessionIds ?? [] }
  })

  server.register('sse.unsubscribe', (params) => {
    const p = params as { clientId: string }
    if (!p?.clientId) throw { code: -32602, message: 'clientId is required' }
    return { removed: subscriptions.delete(p.clientId) }
  })

  // Auth key management (Phase 81)

  server.register('auth.listKeys', async () => {
    if (!opts.authStore) throw { code: -32010, message: 'AuthStore not configured on server' }
    return { keys: await opts.authStore.listKeys() }
  })

  server.register('auth.createKey', async (params) => {
    if (!opts.authStore) throw { code: -32010, message: 'AuthStore not configured on server' }
    const p = (params ?? {}) as {
      name?: string
      env?: string
      scopes?: string[]
      description?: string
      rateLimit?: { capacity?: number; refillPerSec?: number }
    }
    if (!p.name) throw { code: -32602, message: 'name is required' }
    const result = await opts.authStore.createKey({ name: p.name, ...p })
    return { key: result.metadata, secret: result.secret }
  })

  server.register('auth.revokeKey', async (params) => {
    if (!opts.authStore) throw { code: -32010, message: 'AuthStore not configured on server' }
    const p = params as { id: string }
    if (!p?.id) throw { code: -32602, message: 'id is required' }
    const ok = await opts.authStore.revokeKey(p.id)
    if (!ok) throw { code: -32004, message: 'No such key' }
    return { success: true }
  })

  server.register('auth.usage', () => {
    if (!opts.authStore) throw { code: -32010, message: 'AuthStore not configured on server' }
    return { rateLimits: opts.authStore.rateLimitState() }
  })

  return {
    serverInfo,
    supportedMethods,
    capabilities(): ServerCapabilities {
      return {
        streaming: true,
        cancellation: true,
        structuredErrors: true,
        methods: supportedMethods,
      }
    },
  }
}

function loopEventToRpcMethod(event: LoopEvent): string {
  switch (event.type) {
    case 'text':
      return 'text_delta'
    case 'thinking':
      return 'thinking_delta'
    case 'tool-call':
      return 'tool_call'
    case 'tool-call-delta':
      return 'tool_call_delta'
    case 'tool-result':
      return 'tool_result'
    case 'turn':
      return 'turn'
    case 'usage':
      return 'usage'
    case 'finish':
      return 'agent_done'
    case 'error':
      return 'agent_error'
    case 'steering-injected':
      return 'steering'
    default:
      return 'unknown_event'
  }
}
