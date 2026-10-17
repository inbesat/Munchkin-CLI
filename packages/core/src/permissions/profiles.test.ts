import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { CircuitBreakerResult, CircuitBreakerTrigger } from './circuit-breakers'
import type { PermissionMode, ToolCategory } from './modes'
import {
  DEFAULT_CI_PRE_APPROVALS,
  PermissionProfileEngine,
  type ProfileConfig,
  clearProfileEngine,
  createBypassProfile,
  createDontAskProfile,
  evaluateBypassProfile,
  evaluateDontAskProfile,
  evaluateProfile,
  getProfileConfig,
  getProfileEngine,
  isProfileMode,
  setProfileEngine,
} from './profiles'

function trigger(id: string, name: string): CircuitBreakerTrigger {
  return { id, name, description: `test: ${name}`, riskThreshold: 'high', action: 'deny' }
}

describe('Permission Profiles', () => {
  let profileEngine: PermissionProfileEngine

  beforeEach(() => {
    profileEngine = new PermissionProfileEngine()
    clearProfileEngine()
  })

  afterEach(() => {
    clearProfileEngine()
  })

  describe('createDontAskProfile', () => {
    it('creates profile with pre-approvals', () => {
      const config = createDontAskProfile([{ target: 'read', description: 'Allow reads' }])
      expect(config.mode).toBe('dontAsk')
      expect(config.preApproved?.length).toBe(1)
      expect(config.respectCircuitBreakers).toBe(true)
      expect(config.logDenials).toBe(true)
    })

    it('uses defaults when options not provided', () => {
      const config = createDontAskProfile()
      expect(config.preApproved).toEqual([])
      expect(config.respectCircuitBreakers).toBe(true)
      expect(config.logDenials).toBe(true)
    })

    it('allows overriding options', () => {
      const config = createDontAskProfile([], { respectCircuitBreakers: false, logDenials: false })
      expect(config.respectCircuitBreakers).toBe(false)
      expect(config.logDenials).toBe(false)
    })
  })

  describe('createBypassProfile', () => {
    it('creates bypass profile', () => {
      const config = createBypassProfile()
      expect(config.mode).toBe('bypass')
      expect(config.preApproved).toEqual([])
      expect(config.respectCircuitBreakers).toBe(true)
      expect(config.logDenials).toBe(false)
    })

    it('allows disabling circuit breakers', () => {
      const config = createBypassProfile({ respectCircuitBreakers: false })
      expect(config.respectCircuitBreakers).toBe(false)
    })
  })

  describe('DEFAULT_CI_PRE_APPROVALS', () => {
    it('has expected pre-approvals', () => {
      expect(DEFAULT_CI_PRE_APPROVALS.length).toBeGreaterThan(5)

      const targets = DEFAULT_CI_PRE_APPROVALS.map((a) => a.target)
      expect(targets).toContain('read')
      expect(targets).toContain('glob')
      expect(targets).toContain('grep')
      expect(targets).toContain('bash')
    })

    it('bash approval has condition', () => {
      const bashApproval = DEFAULT_CI_PRE_APPROVALS.find((a) => a.target === 'bash')
      expect(bashApproval).toBeDefined()
      expect(bashApproval?.condition).toBeDefined()
    })
  })

  describe('evaluateDontAskProfile', () => {
    const baseConfig: ProfileConfig = createDontAskProfile([
      { target: 'read', description: 'Allow reads' },
      {
        target: 'write',
        condition: (args) => (args.path as string)?.startsWith('dist/'),
        description: 'Allow dist writes',
      },
    ])

    it('allows pre-approved read tools', () => {
      const result = evaluateDontAskProfile('readFile', 'read', { path: 'src/file.ts' }, baseConfig)
      expect(result.decision).toBe('allow')
      expect(result.preApproved).toBe(true)
      expect(result.matchedApproval?.target).toBe('read')
    })

    it('allows pre-approved write to dist/', () => {
      const result = evaluateDontAskProfile(
        'writeFile',
        'write',
        { path: 'dist/output.js' },
        baseConfig,
      )
      expect(result.decision).toBe('allow')
      expect(result.preApproved).toBe(true)
    })

    it('denies write to non-approved paths', () => {
      const result = evaluateDontAskProfile(
        'writeFile',
        'write',
        { path: 'src/file.ts' },
        baseConfig,
      )
      expect(result.decision).toBe('deny')
      expect(result.preApproved).toBe(false)
      expect(result.reason).toContain('not pre-approved')
    })

    it('denies unapproved tools', () => {
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'ls' }, baseConfig)
      expect(result.decision).toBe('deny')
      expect(result.reason).toContain('not pre-approved')
    })

    it('circuit breaker overrides to deny', () => {
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'deny',
        breaker: trigger('rm-rf-root', 'Delete Root'),
      }
      const result = evaluateDontAskProfile(
        'bash',
        'bash',
        { command: 'rm -rf /' },
        baseConfig,
        cbResult,
      )
      expect(result.decision).toBe('deny')
      expect(result.circuitBreakerOverride).toBeDefined()
    })

    it('circuit breaker overrides to ask', () => {
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'prompt',
        breaker: trigger('git-force-push-main', 'Git Force Push'),
      }
      const result = evaluateDontAskProfile(
        'bash',
        'bash',
        { command: 'git push --force' },
        baseConfig,
        cbResult,
      )
      expect(result.decision).toBe('ask')
      expect(result.circuitBreakerOverride).toBeDefined()
    })

    it('respects circuit breaker disabled', () => {
      const config = createDontAskProfile([], { respectCircuitBreakers: false })
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'deny',
        breaker: trigger('rm-rf-root', 'Delete Root'),
      }
      const result = evaluateDontAskProfile(
        'bash',
        'bash',
        { command: 'rm -rf /' },
        config,
        cbResult,
      )
      // Without circuit breaker, falls to pre-approval check which denies
      expect(result.decision).toBe('deny')
    })
  })

  describe('evaluateBypassProfile', () => {
    const baseConfig: ProfileConfig = createBypassProfile()

    it('allows all tools by default', () => {
      for (const tool of ['readFile', 'writeFile', 'editFile', 'bash', 'glob', 'grep']) {
        const category =
          tool === 'bash' ? 'bash' : (tool.replace('File', '').toLowerCase() as ToolCategory)
        const result = evaluateBypassProfile(tool, category, {}, baseConfig)
        expect(result.decision).toBe('allow')
        expect(result.reason).toContain('bypass mode')
      }
    })

    it('circuit breaker overrides to deny', () => {
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'deny',
        breaker: trigger('rm-rf-root', 'Delete Root'),
      }
      const result = evaluateBypassProfile(
        'bash',
        'bash',
        { command: 'rm -rf /' },
        baseConfig,
        cbResult,
      )
      expect(result.decision).toBe('deny')
      expect(result.circuitBreakerOverride).toBeDefined()
    })

    it('circuit breaker overrides to ask', () => {
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'prompt',
        breaker: trigger('git-force-push-main', 'Git Force Push'),
      }
      const result = evaluateBypassProfile(
        'bash',
        'bash',
        { command: 'git push --force' },
        baseConfig,
        cbResult,
      )
      expect(result.decision).toBe('ask')
    })

    it('respects circuit breaker disabled', () => {
      const config = createBypassProfile({ respectCircuitBreakers: false })
      const cbResult: CircuitBreakerResult = {
        triggered: true,
        action: 'deny',
        breaker: trigger('rm-rf-root', 'Delete Root'),
      }
      const result = evaluateBypassProfile(
        'bash',
        'bash',
        { command: 'rm -rf /' },
        config,
        cbResult,
      )
      expect(result.decision).toBe('allow')
    })
  })

  describe('evaluateProfile (unified)', () => {
    it('routes to dontAsk evaluator', () => {
      const config = createDontAskProfile([{ target: 'read', description: 'Allow reads' }])
      const result = evaluateProfile('readFile', 'read', { path: 'file.ts' }, config)
      expect(result.decision).toBe('allow')
    })

    it('routes to bypass evaluator', () => {
      const config = createBypassProfile()
      const result = evaluateProfile('writeFile', 'write', { path: 'file.ts' }, config)
      expect(result.decision).toBe('allow')
    })

    it('returns ask for non-profile modes', () => {
      const config = { mode: 'default' as PermissionMode, customRules: [] }
      // This is a type test - the function expects ProfileConfig
      // biome-ignore lint/suspicious/noExplicitAny: deliberately off-profile mode to exercise the ask fallback
      const result = evaluateProfile('bash', 'bash', { command: 'ls' }, config as any)
      expect(result.decision).toBe('ask')
    })
  })

  describe('isProfileMode', () => {
    it('returns true for dontAsk', () => {
      expect(isProfileMode('dontAsk')).toBe(true)
    })

    it('returns true for bypass', () => {
      expect(isProfileMode('bypass')).toBe(true)
    })

    it('returns false for other modes', () => {
      expect(isProfileMode('default')).toBe(false)
      expect(isProfileMode('acceptEdits')).toBe(false)
      expect(isProfileMode('plan')).toBe(false)
      expect(isProfileMode('auto')).toBe(false)
    })
  })

  describe('getProfileConfig', () => {
    it('returns dontAsk config', () => {
      const modeConfig = { mode: 'dontAsk' as PermissionMode, customRules: undefined }
      const config = getProfileConfig(modeConfig)
      expect(config).not.toBeNull()
      expect(config?.mode).toBe('dontAsk')
      expect(config?.preApproved?.length).toBeGreaterThan(0)
    })

    it('returns bypass config', () => {
      const modeConfig = { mode: 'bypass' as PermissionMode, customRules: undefined }
      const config = getProfileConfig(modeConfig)
      expect(config).not.toBeNull()
      expect(config?.mode).toBe('bypass')
    })

    it('returns null for other modes', () => {
      const modeConfig = { mode: 'default' as PermissionMode, customRules: undefined }
      expect(getProfileConfig(modeConfig)).toBeNull()
    })

    it('uses custom rules as pre-approvals', () => {
      const modeConfig = {
        mode: 'dontAsk' as PermissionMode,
        customRules: [
          { target: 'read' as ToolCategory, decision: 'allow' },
          { target: 'write' as ToolCategory, decision: 'allow' },
        ],
      }
      const config = getProfileConfig(modeConfig)
      expect(config?.preApproved?.length).toBe(2)
    })
  })

  describe('PermissionProfileEngine', () => {
    it('sets and gets profile', () => {
      const config = createDontAskProfile([{ target: 'read', description: 'Allow reads' }])
      profileEngine.setProfile(config)
      expect(profileEngine.getProfile()).toBe(config)
      expect(profileEngine.hasActiveProfile()).toBe(true)
    })

    it('clears profile', () => {
      profileEngine.setProfile(createDontAskProfile())
      profileEngine.clearProfile()
      expect(profileEngine.getProfile()).toBeNull()
      expect(profileEngine.hasActiveProfile()).toBe(false)
    })

    it('evaluates with active profile', async () => {
      profileEngine.setProfile(
        createDontAskProfile([{ target: 'read', description: 'Allow reads' }]),
      )

      const result = await profileEngine.evaluate('readFile', 'read', { path: 'file.ts' })
      expect(result?.decision).toBe('allow')
      expect(result?.preApproved).toBe(true)
    })

    it('returns null when no profile active', async () => {
      const result = await profileEngine.evaluate('readFile', 'read', { path: 'file.ts' })
      expect(result).toBeNull()
    })

    it('denies unapproved tools in dontAsk', async () => {
      profileEngine.setProfile(createDontAskProfile())

      const result = await profileEngine.evaluate('bash', 'bash', { command: 'ls' })
      expect(result?.decision).toBe('deny')
    })
  })

  describe('Global profile engine', () => {
    it('getProfileEngine returns singleton', () => {
      const e1 = getProfileEngine()
      const e2 = getProfileEngine()
      expect(e1).toBe(e2)
    })

    it('setProfileEngine replaces singleton', () => {
      const custom = new PermissionProfileEngine()
      setProfileEngine(custom)
      expect(getProfileEngine()).toBe(custom)
    })

    it('clearProfileEngine resets singleton', () => {
      getProfileEngine()
      clearProfileEngine()
      const e = getProfileEngine()
      expect(e).toBeDefined()
    })
  })

  describe('CI pre-approvals', () => {
    it('approves npm run commands', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'npm run test' }, config)
      expect(result.decision).toBe('allow')
      expect(result.preApproved).toBe(true)
    })

    it('approves npm test', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'npm test' }, config)
      expect(result.decision).toBe('allow')
    })

    it('approves yarn build', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'yarn build' }, config)
      expect(result.decision).toBe('allow')
    })

    it('approves cargo test', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'cargo test' }, config)
      expect(result.decision).toBe('allow')
    })

    it('approves go test', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'go test' }, config)
      expect(result.decision).toBe('allow')
    })

    it('approves pytest', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'pytest' }, config)
      expect(result.decision).toBe('allow')
    })

    it('approves write to dist/', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile(
        'writeFile',
        'write',
        { path: 'dist/bundle.js' },
        config,
      )
      expect(result.decision).toBe('allow')
    })

    it('denies write to src/', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('writeFile', 'write', { path: 'src/main.ts' }, config)
      expect(result.decision).toBe('deny')
    })

    it('denies arbitrary bash commands', async () => {
      const config = createDontAskProfile(DEFAULT_CI_PRE_APPROVALS)
      const result = evaluateDontAskProfile('bash', 'bash', { command: 'rm -rf /' }, config)
      expect(result.decision).toBe('deny')
    })
  })

  describe('Edge cases', () => {
    it('handles empty pre-approvals', () => {
      const config = createDontAskProfile([])
      const result = evaluateDontAskProfile('readFile', 'read', { path: 'file.ts' }, config)
      expect(result.decision).toBe('deny')
    })

    it('handles undefined pre-approvals', () => {
      const config = createDontAskProfile()
      const result = evaluateDontAskProfile('readFile', 'read', { path: 'file.ts' }, config)
      expect(result.decision).toBe('deny')
    })

    it('category matching works for tool names', () => {
      const config = createDontAskProfile([{ target: 'read', description: 'Allow reads' }])
      expect(evaluateDontAskProfile('readFile', 'read', {}, config).decision).toBe('allow')
      expect(evaluateDontAskProfile('read', 'read', {}, config).decision).toBe('allow')
    })

    it('condition function receives args', () => {
      let receivedArgs: Record<string, unknown> | undefined
      const config = createDontAskProfile([
        {
          target: 'bash',
          condition: (args) => {
            receivedArgs = args
            return true
          },
          description: 'Test condition',
        },
      ])
      evaluateDontAskProfile('bash', 'bash', { command: 'ls', cwd: '/tmp' }, config)
      expect(receivedArgs).toEqual({ command: 'ls', cwd: '/tmp' })
    })
  })
})
