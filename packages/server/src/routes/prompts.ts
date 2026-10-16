import { type Logger, getLogger } from '@forge/core'
import { Hono } from 'hono'
import { createValidationMiddleware, promptSchema } from '../middleware/validation'
import type { AgentExecutor } from '../services/agent-executor'
import type { SessionManager } from '../services/session-manager'
import type { PromptRequest, PromptResponse } from '../types'

export function createPromptsRoutes(
  agentExecutor: AgentExecutor,
  sessionManager: SessionManager,
  logger?: Logger,
) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.post('/:sessionId', createValidationMiddleware(promptSchema), async (c) => {
    const sessionId = c.req.param('sessionId')
    if (!sessionId) {
      return c.json<PromptResponse>(
        {
          sessionId: '',
          response: '',
          usage: { input: 0, output: 0, total: 0 },
          turns: 0,
          reason: 'error',
          error: 'Missing session id',
        },
        400,
      )
    }
    const data = c.get('validatedData') as PromptRequest

    const session = await sessionManager.getSession(sessionId)
    if (!session) {
      return c.json<PromptResponse>(
        {
          sessionId,
          response: '',
          usage: { input: 0, output: 0, total: 0 },
          turns: 0,
          reason: 'error',
          error: 'Session not found',
        },
        404,
      )
    }

    const result = await agentExecutor.executePrompt(
      sessionId,
      data.prompt,
      {
        modelId: data.model,
        systemPrompt: data.systemPrompt,
        tools: data.tools,
        maxIterations: data.maxIterations,
      },
      (event) => {
        log.debug('Agent event', { sessionId, eventType: event.type })
      },
    )

    return c.json<PromptResponse>({
      sessionId,
      response: result.response,
      usage: {
        input: result.usage.input,
        output: result.usage.output,
        total: result.usage.total,
        cacheRead: result.usage.cacheRead,
        cacheWrite: result.usage.cacheWrite,
      },
      turns: result.turns,
      reason: result.reason,
      error: result.error instanceof Error ? result.error.message : String(result.error ?? ''),
    })
  })

  return app
}
