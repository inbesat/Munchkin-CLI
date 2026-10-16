/**
 * Connector wizard (Phase 122): a step-driven state machine over the
 * Phase-121 presets - the TUI renders the prompts, the engine validates
 * answers, and at the end `finish()` produces a resolved server spec and
 * `connectSpec()` verifies the connection with a real initialize handshake
 * (Phase-117 stdio transport). No-throw throughout.
 */

import { McpStdioTransport } from '../client/stdio'
import { type ResolvedServerSpec, getPreset, resolveServerSpec } from './index'

export interface WizardStep {
  id: string
  prompt: string
  kind: 'secret' | 'text' | 'confirm'
  /** Empty answers are rejected unless optional. */
  optional?: boolean
}

export interface WizardAnswers {
  env: Record<string, string>
  args: string[]
  scopes?: string
  readOnly?: boolean
}

export interface WizardState {
  presetId: string
  stepIndex: number
  answers: WizardAnswers
}

const READ_ONLY_STEP_ID = 'read_only'
const SCOPES_STEP_ID = 'scopes'

function stepsForPreset(presetId: string): WizardStep[] {
  const preset = getPreset(presetId)
  if (preset === undefined) return []
  const steps: WizardStep[] = []
  for (const key of preset.requiredEnv ?? []) {
    steps.push({
      id: `env:${key}`,
      kind: 'secret',
      prompt: `Set ${key} (press enter to inherit it from the environment)`,
    })
  }
  for (const arg of preset.expectsArgs ?? []) {
    steps.push({
      id: `arg:${arg.name}`,
      kind: 'text',
      prompt: `${arg.description} (for ${arg.name})`,
      optional: arg.optional,
    })
  }
  steps.push({
    id: SCOPES_STEP_ID,
    kind: 'text',
    optional: true,
    prompt: 'Scopes to request (comma-separated, enter to skip)',
  })
  steps.push({
    id: READ_ONLY_STEP_ID,
    kind: 'confirm',
    optional: true,
    prompt: 'Run in read-only mode? (yes/no)',
  })
  return steps
}

export class ConnectorWizard {
  private readonly presetId: string
  private readonly steps: WizardStep[]
  private readonly answers: WizardAnswers = { env: {}, args: [] }
  private state: WizardState

  constructor(presetId: string) {
    this.presetId = presetId
    this.steps = stepsForPreset(presetId)
    this.state = { presetId, stepIndex: 0, answers: this.answers }
  }

  get preset(): string {
    return this.presetId
  }

  get stepCount(): number {
    return this.steps.length
  }

  /** The prompt to show right now, with progress, or null when finished. */
  currentPrompt(): string | null {
    const step = this.steps[this.state.stepIndex]
    if (step === undefined) return null
    return `[${this.presetId} ${this.state.stepIndex + 1}/${this.steps.length}] ${step.prompt}`
  }

  isComplete(): boolean {
    return this.state.stepIndex >= this.steps.length
  }

  /**
   * Submit an answer for the current step. Returns an error string for
   * invalid answers (empty required values).
   */
  answer(value: string): { ok: boolean; error?: string } {
    const step = this.steps[this.state.stepIndex]
    if (step === undefined) return { ok: false, error: 'the wizard is already complete' }
    const trimmed = value.trim()
    if (trimmed.length === 0 && step.optional !== true) {
      return { ok: false, error: `'${step.id}' requires a value - it cannot be empty` }
    }
    if (step.id.startsWith('env:')) {
      const key = step.id.slice('env:'.length)
      if (trimmed.length > 0) this.answers.env[key] = trimmed
    } else if (step.id.startsWith('arg:')) {
      if (trimmed.length > 0) this.answers.args.push(trimmed)
    } else if (step.id === SCOPES_STEP_ID) {
      if (trimmed.length > 0) this.answers.scopes = trimmed
    } else if (step.id === READ_ONLY_STEP_ID) {
      this.answers.readOnly = /^(yes|y|true|1)$/i.test(trimmed)
    }
    this.state = {
      ...this.state,
      stepIndex: this.state.stepIndex + 1,
    }
    return { ok: true }
  }

  /** Assemble the server spec from collected answers. */
  finish(): { ok: true; spec: ResolvedServerSpec } | { ok: false; error: string } {
    if (!this.isComplete()) {
      return {
        ok: false,
        error: `wizard incomplete: ${this.steps.length - this.state.stepIndex} step(s) left`,
      }
    }
    const preset = getPreset(this.presetId)
    if (preset === undefined) return { ok: false, error: `unknown preset '${this.presetId}'` }
    const env: Record<string, string> = { ...this.answers.env }
    if (this.answers.scopes !== undefined) env.MCP_SCOPES = this.answers.scopes
    if (this.answers.readOnly === true) env.FORGE_CONNECTOR_READ_ONLY = 'true'
    const resolved = resolveServerSpec(preset, this.answers.args)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    return {
      ok: true,
      spec: {
        command: resolved.spec.command,
        args: [...resolved.spec.args],
        env: { ...resolved.spec.env, ...env },
      },
    }
  }
}

/**
 * Verify a connection: spawn the server and complete an initialize
 * handshake. Failure carries the transport's diagnostics.
 */
export async function connectSpec(
  spec: ResolvedServerSpec,
  timeoutMs = 15_000,
): Promise<{ ok: true; serverName: string } | { ok: false; error: string }> {
  const transport = new McpStdioTransport({
    command: spec.command,
    args: spec.args,
    env: spec.env,
    requestTimeoutMs: timeoutMs,
  })
  const spawned = transport.spawn()
  if (!spawned.ok) return { ok: false, error: spawned.error ?? 'spawn failed' }

  const initialized = await transport.request(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'forge', version: '0.1.0' },
    },
    timeoutMs,
  )
  let serverName = 'unknown'
  if (initialized.ok) {
    const info = initialized.result as { serverInfo?: { name?: string } }
    if (typeof info.serverInfo?.name === 'string') serverName = info.serverInfo.name
    transport.notify('notifications/initialized')
  }
  transport.close()
  if (!initialized.ok) {
    const diagnostics = transport.stderrTail().join(' | ').slice(0, 200)
    return {
      ok: false,
      error: `connection test failed: ${initialized.error}${diagnostics.length > 0 ? ` (${diagnostics})` : ''}`,
    }
  }
  return { ok: true, serverName }
}
