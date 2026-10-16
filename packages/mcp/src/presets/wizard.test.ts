import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import type { ResolvedServerSpec } from './index'
import { ConnectorWizard, connectSpec } from './wizard'

const MOCK_SERVER = join(import.meta.dir, '..', 'client', 'mock-server.ts')

describe('connector wizard (Phase 122)', () => {
  it('generates steps for required env, args, scopes, and read-only', () => {
    const wizard = new ConnectorWizard('github')
    expect(wizard.stepCount).toBe(3) // GITHUB_TOKEN env + scopes + read-only
    const first = wizard.currentPrompt()
    expect(first).toContain('GITHUB_TOKEN')
    expect(first).toContain('[github 1/')
  })

  it('validates required answers and advances through the flow', () => {
    const wizard = new ConnectorWizard('filesystem')
    // filesystem has no requiredEnv: the root argument step is first.
    const empty = wizard.answer('')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error).toContain('requires a value')

    expect(wizard.answer('/tmp/project').ok).toBe(true)
    expect(wizard.currentPrompt() ?? '').toContain('Scopes')
    wizard.answer('repo, workflow')
    expect(wizard.currentPrompt() ?? '').toContain('read-only')
    wizard.answer('yes')
    expect(wizard.isComplete()).toBe(true)
    expect(wizard.currentPrompt()).toBeNull()

    const finished = wizard.finish()
    expect(finished.ok).toBe(true)
    if (finished.ok) {
      expect(finished.spec.args).toContain('/tmp/project')
      expect(finished.spec.env.MCP_SCOPES).toBe('repo, workflow')
      expect(finished.spec.env.FORGE_CONNECTOR_READ_ONLY).toBe('true')
    }
  })

  it('refuses to finish while steps remain', () => {
    const wizard = new ConnectorWizard('github')
    const early = wizard.finish()
    expect(early.ok).toBe(false)
    if (!early.ok) expect(early.error).toContain('wizard incomplete')
  })

  it('optional env inherits from the host and read-only=no omits the flag', () => {
    const wizard = new ConnectorWizard('memory')
    // memory has no requiredEnv: steps are scopes + read-only (both optional).
    expect(wizard.answer('').ok).toBe(true) // skip scopes
    expect(wizard.currentPrompt() ?? '').toContain('read-only')
    wizard.answer('no')
    expect(wizard.isComplete()).toBe(true)

    const finished = wizard.finish()
    expect(finished.ok).toBe(true)
    if (finished.ok) {
      expect(finished.spec.env.FORGE_CONNECTOR_READ_ONLY).toBeUndefined()
      expect(finished.spec.env.MCP_SCOPES).toBeUndefined()
    }
  })

  it('connectSpec verifies a real server via the initialize handshake', async () => {
    const spec: ResolvedServerSpec = {
      command: process.execPath,
      args: ['run', MOCK_SERVER],
      env: {},
    }
    const verified = await connectSpec(spec, 10_000)
    expect(verified.ok).toBe(true)
    if (verified.ok) expect(verified.serverName).toBe('forge-mock-mcp')
  })

  it('connectSpec reports a dead command without throwing', async () => {
    const spec: ResolvedServerSpec = {
      command: 'definitely-not-a-real-server-xyz',
      args: [],
      env: {},
    }
    const failed = await connectSpec(spec, 2_000)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toContain('failed')
  })

  it('connectSpec surfaces per-request timeout as a failed connection', async () => {
    const spec: ResolvedServerSpec = {
      command: process.execPath,
      args: ['run', MOCK_SERVER],
      env: {},
    }
    // The mock answers initialize, but a 0.001ms timeout can only lose the race.
    const failed = await connectSpec(spec, 1)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toContain('connection test failed')
  })
})
