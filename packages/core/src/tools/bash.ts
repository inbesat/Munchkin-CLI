import { Type } from '@sinclair/typebox'
import { ErrorCode, ToolError } from '../errors'
import { BashManager, type CreateSessionOptions, type ShellSession } from './bash-manager'
import type { Tool, ToolResult } from './types'

/** Bash tool input schema. */
export const BashSchema = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
  sessionId: Type.Optional(
    Type.String({ description: 'Shell session ID (new session created if omitted)' }),
  ),
  timeout: Type.Optional(
    Type.Integer({
      minimum: 1000,
      maximum: 300_000,
      default: 120_000,
      description: 'Timeout in milliseconds',
    }),
  ),
  cwd: Type.Optional(Type.String({ description: 'Working directory (overrides session cwd)' })),
  env: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: 'Additional environment variables' }),
  ),
  background: Type.Optional(
    Type.Boolean({ default: false, description: 'Run in background (non-blocking)' }),
  ),
  newShell: Type.Optional(
    Type.Boolean({ default: false, description: 'Force creation of a new shell session' }),
  ),
})

/** Bash tool output metadata. */
export interface BashResult extends ToolResult {
  metadata?: {
    exitCode: number | null
    timedOut: boolean
    durationMs: number
    sessionId: string
    background: boolean
  }
}

/** Shared default manager: sessions created via createShellSession are usable by tools that use the default manager. */
const defaultManager = new BashManager()

/** Create the Bash tool with a manager instance. */
export function createBashTool(manager: BashManager = defaultManager): Tool {
  return {
    name: 'bash',
    description: 'Execute shell commands. Supports persistent sessions for environment state.',
    parameters: BashSchema,
    scope: 'builtin',
    risk: 'high',
    requiresPermission: true,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<BashResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Bash operation cancelled', 'bash')
      }

      const {
        command,
        sessionId: providedSessionId,
        timeout,
        cwd,
        env,
        background,
        newShell,
      } = input as {
        command: string
        sessionId?: string
        timeout?: number
        cwd?: string
        env?: Record<string, string>
        background?: boolean
        newShell?: boolean
      }

      // Handle background execution
      if (background) {
        let sessionId = providedSessionId
        if (newShell || !sessionId) {
          const session = manager.getOrCreateSession({})
          sessionId = session.id
        } else {
          const session = manager.getSession(sessionId)
          if (!session) {
            throw new ToolError(
              ErrorCode.TOOL_INVALID_INPUT,
              `Shell session not found: ${sessionId}`,
              'bash',
            )
          }
        }

        const { pid, abort } = manager.executeBackground(sessionId, command, { cwd, env })

        // Register abort handler
        if (signal) {
          signal.addEventListener('abort', abort, { once: true })
        }

        return {
          success: true,
          output: `Background command started (PID: ${pid}). Use session ${sessionId} to track.`,
          metadata: {
            exitCode: null,
            timedOut: false,
            durationMs: 0,
            sessionId,
            background: true,
          },
        }
      }

      // Foreground execution
      let sessionId = providedSessionId
      if (newShell || !sessionId) {
        const session = manager.getOrCreateSession({})
        sessionId = session.id
      } else {
        const session = manager.getSession(sessionId)
        if (!session) {
          throw new ToolError(
            ErrorCode.TOOL_INVALID_INPUT,
            `Shell session not found: ${sessionId}`,
            'bash',
          )
        }
      }

      // Execute with timeout
      const result = await manager.execute(sessionId, command, {
        timeout,
        cwd,
        env,
      })

      // Check abort signal after execution
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'Bash operation cancelled', 'bash')
      }

      // Format output
      let output = ''
      if (result.stdout) output += result.stdout
      if (result.stderr) output += (output ? '\n' : '') + result.stderr
      if (!output) output = '(no output)'

      if (result.timedOut) {
        output += `\n[Command timed out after ${timeout ?? 120000}ms]`
      } else if (result.exitCode !== null && result.exitCode !== 0) {
        output += `\n[Exit code: ${result.exitCode}]`
      }

      return {
        success: !result.timedOut && (result.exitCode === 0 || result.exitCode === null),
        output: output.trim(),
        metadata: {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          sessionId,
          background: false,
        },
      }
    },
  }
}

/** Default bash tool instance. */
export const bashTool = createBashTool()

/** Helper to create a new shell session (attached to the shared default manager). */
export function createShellSession(options?: CreateSessionOptions): ShellSession {
  return defaultManager.getOrCreateSession(options)
}
