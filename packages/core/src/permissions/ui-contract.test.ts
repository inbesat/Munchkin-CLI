import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  PermissionUI,
  PermissionRequest,
  PermissionResponse,
  PermissionDecision,
  UICapabilities,
  UIConfig,
  MockPermissionUI,
  AutoApproveUI,
  AutoDenyUI,
  DefaultPermissionUIFactory,
  getUIFactory,
  setUIFactory,
  shouldRemember,
  hasCustomRule,
  createPermissionRequest,
  HeadlessUIConfig,
  SDKUIConfig,
  BatchPermissionRequest,
  BatchPermissionResponse,
  BatchPermissionUI,
  InteractivePermissionUI,
} from './ui-contract'
import { AgentTool } from '../agent/types'
import { ToolCategory } from './modes'

const createMockTool = (name: string): AgentTool => ({
  name,
  description: `Mock ${name} tool`,
  execute: async () => '',
})

const createRequest = (overrides: Partial<PermissionRequest> = {}): PermissionRequest => ({
  id: `req-${Date.now()}`,
  timestamp: new Date().toISOString(),
  tool: createMockTool('bash'),
  args: { command: 'ls' },
  category: 'bash',
  sessionId: 'test-session',
  permissionMode: 'default',
  ...overrides,
})

describe('Permission UI Contract', () => {
  let factory: DefaultPermissionUIFactory

  beforeEach(() => {
    factory = new DefaultPermissionUIFactory()
    setUIFactory(factory)
  })

  afterEach(() => {
    setUIFactory(new DefaultPermissionUIFactory())
  })

  describe('PermissionRequest', () => {
    it('has all required fields', () => {
      const request = createRequest()
      expect(request).toHaveProperty('id')
      expect(request).toHaveProperty('timestamp')
      expect(request).toHaveProperty('tool')
      expect(request).toHaveProperty('args')
      expect(request).toHaveProperty('category')
      expect(request).toHaveProperty('sessionId')
      expect(request).toHaveProperty('permissionMode')
    })

    it('includes optional risk fields', () => {
      const request = createRequest({
        riskLevel: 'high',
        riskReason: 'Destructive command',
        isRetry: true,
      })
      expect(request.riskLevel).toBe('high')
      expect(request.riskReason).toBe('Destructive command')
      expect(request.isRetry).toBe(true)
    })
  })

  describe('PermissionResponse', () => {
    it('has required fields', () => {
      const response: PermissionResponse = {
        requestId: 'req-1',
        decision: 'allow',
      }
      expect(response.requestId).toBe('req-1')
      expect(response.decision).toBe('allow')
    })

    it('supports remember flag', () => {
      const response: PermissionResponse = {
        requestId: 'req-1',
        decision: 'allow',
        remember: true,
      }
      expect(shouldRemember(response)).toBe(true)
    })

    it('supports custom rules', () => {
      const response: PermissionResponse = {
        requestId: 'req-1',
        decision: 'allow',
        customRule: { target: 'bash' },
      }
      expect(hasCustomRule(response)).toBe(true)
    })
  })

  describe('MockPermissionUI', () => {
    let ui: MockPermissionUI

    beforeEach(() => {
      ui = new MockPermissionUI('allow')
    })

    it('returns default decision', async () => {
      const request = createRequest()
      const response = await ui.requestPermission(request)
      expect(response.decision).toBe('allow')
      expect(response.requestId).toBe(request.id)
    })

    it('uses tool-specific response', async () => {
      ui.setToolResponse('bash', 'deny')
      const request = createRequest({ tool: createMockTool('bash') })
      const response = await ui.requestPermission(request)
      expect(response.decision).toBe('deny')
    })

    it('uses request-specific response', async () => {
      const request = createRequest({ id: 'specific-req' })
      ui.setResponse('specific-req', 'ask')
      const response = await ui.requestPermission(request)
      expect(response.decision).toBe('ask')
    })

    it('logs calls', async () => {
      const request = createRequest()
      await ui.requestPermission(request)
      const log = ui.getCallLog()
      expect(log.length).toBe(1)
      expect(log[0].request.id).toBe(request.id)
    })

    it('tracks tool results', async () => {
      ui.notifyToolResult('req-1', true, 'output')
      const log = ui.getCallLog()
      expect(log.some((c) => c.request.id === 'req-1')).toBe(true)
    })

    it('has correct capabilities', () => {
      const caps = ui.getCapabilities()
      expect(caps.interactive).toBe(false)
      expect(caps.richFormatting).toBe(false)
    })

    it('allows config updates', () => {
      ui.setConfig({ defaultDecision: 'deny' })
      const config = ui.getConfig()
      expect(config.defaultDecision).toBe('deny')
    })

    it('clears state', () => {
      ui.setResponse('req-1', 'allow')
      ui.clear()
      expect(ui.getCallLog().length).toBe(0)
    })
  })

  describe('AutoApproveUI', () => {
    it('always approves', async () => {
      const ui = new AutoApproveUI()
      const request = createRequest({ tool: createMockTool('bash'), args: { command: 'rm -rf /' } })
      const response = await ui.requestPermission(request)
      expect(response.decision).toBe('allow')
    })

    it('uses custom decider if provided', async () => {
      const config: HeadlessUIConfig = {
        customDecider: async (req) => (req.tool.name === 'bash' ? 'deny' : 'allow'),
      }
      const ui = new AutoApproveUI(config)

      const bashRequest = createRequest({ tool: createMockTool('bash') })
      const readRequest = createRequest({ tool: createMockTool('readFile') })

      expect((await ui.requestPermission(bashRequest)).decision).toBe('deny')
      expect((await ui.requestPermission(readRequest)).decision).toBe('allow')
    })
  })

  describe('AutoDenyUI', () => {
    it('always denies', async () => {
      const ui = new AutoDenyUI()
      const request = createRequest({ tool: createMockTool('readFile') })
      const response = await ui.requestPermission(request)
      expect(response.decision).toBe('deny')
    })
  })

  describe('DefaultPermissionUIFactory', () => {
    it('creates UI instances', () => {
      const ui = factory.createUI()
      expect(ui).toBeInstanceOf(MockPermissionUI)
    })

    it('creates headless UI', () => {
      const ui = factory.createHeadlessUI()
      expect(ui).toBeInstanceOf(AutoApproveUI)
    })

    it('creates SDK UI with callbacks', async () => {
      let capturedRequest: PermissionRequest | null = null
      const config: SDKUIConfig = {
        onRequest: async (req) => {
          capturedRequest = req
          return { requestId: req.id, decision: 'allow' }
        },
      }
      const ui = factory.createSDKUI(config)
      const request = createRequest()
      await ui.requestPermission(request)
      expect(capturedRequest).toBe(request)
    })
  })

  describe('Global factory', () => {
    it('returns singleton', () => {
      const f1 = getUIFactory()
      const f2 = getUIFactory()
      expect(f1).toBe(f2)
    })

    it('allows replacement', () => {
      const custom = new DefaultPermissionUIFactory()
      setUIFactory(custom)
      expect(getUIFactory()).toBe(custom)
    })
  })

  describe('Helper functions', () => {
    it('shouldRemember detects remember flag', () => {
      expect(shouldRemember({ requestId: '1', decision: 'allow', remember: true })).toBe(true)
      expect(shouldRemember({ requestId: '1', decision: 'allow', remember: false })).toBe(false)
      expect(shouldRemember({ requestId: '1', decision: 'allow' })).toBe(false)
    })

    it('hasCustomRule detects custom rule', () => {
      expect(hasCustomRule({ requestId: '1', decision: 'allow', customRule: { target: 'bash' } })).toBe(true)
      expect(hasCustomRule({ requestId: '1', decision: 'allow' })).toBe(false)
    })
  })

  describe('createPermissionRequest', () => {
    it('creates request with all fields', async () => {
      const tool = createMockTool('bash')
      const request = await createPermissionRequest(tool, { command: 'ls' }, 'session-1', 'default', {
        riskLevel: 'low',
        riskReason: 'Safe command',
      })
      expect(request.tool).toBe(tool)
      expect(request.args).toEqual({ command: 'ls' })
      expect(request.sessionId).toBe('session-1')
      expect(request.permissionMode).toBe('default')
      expect(request.riskLevel).toBe('low')
      expect(request.riskReason).toBe('Safe command')
    })

    it('infers category from tool', async () => {
      const tool = createMockTool('readFile')
      const request = await createPermissionRequest(tool, { path: 'file.txt' }, 'session-1', 'default')
      expect(request.category).toBe('read')
    })
  })

  describe('Batch permissions', () => {
    it('supports batch requests', () => {
      const batch: BatchPermissionRequest = {
        id: 'batch-1',
        requests: [createRequest({ id: 'req-1' }), createRequest({ id: 'req-2' })],
        allOrNothing: true,
        sessionId: 'session-1',
      }
      expect(batch.requests.length).toBe(2)
      expect(batch.allOrNothing).toBe(true)
    })

    it('supports batch responses', () => {
      const responses = new Map<string, PermissionResponse>()
      responses.set('req-1', { requestId: 'req-1', decision: 'allow' })
      responses.set('req-2', { requestId: 'req-2', decision: 'allow' })

      const batchResponse: BatchPermissionResponse = {
        batchId: 'batch-1',
        responses,
      }
      expect(batchResponse.responses.size).toBe(2)
    })
  })

  describe('InteractivePermissionUI base class', () => {
    class TestInteractiveUI extends InteractivePermissionUI {
      async requestPermission(request: PermissionRequest): Promise<PermissionResponse> {
        return { requestId: request.id, decision: 'allow' }
      }
    }

    it('provides default capabilities', () => {
      const ui = new TestInteractiveUI()
      const caps = ui.getCapabilities()
      expect(caps.interactive).toBe(true)
      expect(caps.richFormatting).toBe(true)
      expect(caps.streaming).toBe(true)
      expect(caps.keyboardShortcuts).toBe(true)
    })

    it('formats args', () => {
      const ui = new TestInteractiveUI()
      expect(ui.formatArgs({ a: 1, b: 'test' })).toBe('a: 1, b: test')
      expect(ui.formatArgs({})).toBe('(no arguments)')
    })

    it('formats risk levels', () => {
      const ui = new TestInteractiveUI()
      expect(ui.formatRisk('low')).toContain('LOW')
      expect(ui.formatRisk('high')).toContain('HIGH')
      expect(ui.formatRisk('critical')).toContain('CRITICAL')
    })
  })

  describe('Contract compliance', () => {
    it('all UIs implement PermissionUI interface', async () => {
      const uis: PermissionUI[] = [
        new MockPermissionUI(),
        new AutoApproveUI(),
        new AutoDenyUI(),
        factory.createUI(),
        factory.createHeadlessUI(),
      ]

      for (const ui of uis) {
        const request = createRequest({ id: `req-${Date.now()}` })
        const response = await ui.requestPermission(request)
        expect(response).toHaveProperty('requestId')
        expect(response).toHaveProperty('decision')
        expect(['allow', 'ask', 'deny']).toContain(response.decision)

        expect(ui.getCapabilities()).toHaveProperty('interactive')
        expect(ui.getConfig()).toHaveProperty('timeout')
      }
    })

    it('supports notifyDecision and notifyToolResult', async () => {
      const ui = new MockPermissionUI()
      const request = createRequest()
      const response = { requestId: request.id, decision: 'allow' as PermissionDecision }

      ui.notifyDecision(request, response)
      ui.notifyToolResult(request.id, true, 'output')

      const log = ui.getCallLog()
      expect(log.length).toBe(2)
    })

    it('supports session lifecycle callbacks', () => {
      const ui = new MockPermissionUI()
      ui.onSessionStart('session-1')
      ui.onSessionEnd('session-1')
      ui.onModeChange('default', 'acceptEdits')
      // Should not throw
    })
  })
})