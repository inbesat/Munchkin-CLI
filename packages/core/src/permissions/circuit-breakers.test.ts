import { describe, expect, it } from 'bun:test'
import {
  type CircuitBreakerContext,
  type CircuitBreakerTrigger,
  DEFAULT_CIRCUIT_BREAKERS,
  addCircuitBreaker,
  evaluateCircuitBreakers,
  getEnabledCircuitBreakers,
  isCircuitBreakerTriggered,
  previewCircuitBreakers,
  removeCircuitBreaker,
  setCircuitBreakerEnabled,
  shouldOverrideBypass,
} from './circuit-breakers'

const createContext = (overrides: Partial<CircuitBreakerContext> = {}): CircuitBreakerContext => ({
  command: 'ls',
  riskLevel: 'low',
  permissionMode: 'default',
  toolName: 'bash',
  toolArgs: {},
  ...overrides,
})

describe('Circuit Breakers', () => {
  describe('DEFAULT_CIRCUIT_BREAKERS', () => {
    it('has expected breakers', () => {
      expect(DEFAULT_CIRCUIT_BREAKERS.length).toBeGreaterThan(10)

      const ids = DEFAULT_CIRCUIT_BREAKERS.map((b) => b.id)
      expect(ids).toContain('rm-rf-root')
      expect(ids).toContain('rm-rf-home')
      expect(ids).toContain('fork-bomb')
      expect(ids).toContain('disk-destructive')
      expect(ids).toContain('system-shutdown')
      expect(ids).toContain('git-force-push-main')
      expect(ids).toContain('sql-drop-table')
    })

    it('all breakers have required fields', () => {
      for (const breaker of DEFAULT_CIRCUIT_BREAKERS) {
        expect(breaker.id).toBeDefined()
        expect(breaker.name).toBeDefined()
        expect(breaker.description).toBeDefined()
        expect(breaker.riskThreshold).toBeDefined()
        expect(breaker.action).toBeDefined()
        expect(breaker.priority).toBeDefined()
      }
    })

    it('has correct action types', () => {
      for (const breaker of DEFAULT_CIRCUIT_BREAKERS) {
        expect(['prompt', 'deny', 'log']).toContain(breaker.action)
      }
    })
  })

  describe('evaluateCircuitBreakers', () => {
    it('does not trigger for low risk commands in default mode', () => {
      const ctx = createContext({ command: 'ls -la', riskLevel: 'low' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(false)
    })

    it('triggers for rm -rf / (critical)', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('rm-rf-root')
      expect(result.action).toBe('prompt')
    })

    it('triggers for rm -rf ~ (critical)', () => {
      const ctx = createContext({ command: 'rm -rf ~', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('rm-rf-home')
    })

    it('triggers for fork bomb', () => {
      const ctx = createContext({ command: ':(){ :|:& };:', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('fork-bomb')
      expect(result.action).toBe('deny')
    })

    it('triggers for dd to disk', () => {
      const ctx = createContext({ command: 'dd if=/dev/zero of=/dev/sda', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('disk-destructive')
    })

    it('triggers for shutdown', () => {
      const ctx = createContext({ command: 'shutdown -h now', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('system-shutdown')
    })

    it('triggers for reboot', () => {
      const ctx = createContext({ command: 'reboot', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('system-shutdown')
    })

    it('triggers for git push --force to main', () => {
      const ctx = createContext({
        command: 'git push origin main --force',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('git-force-push-main')
    })

    it('triggers for DROP TABLE', () => {
      const ctx = createContext({
        command: 'DROP TABLE users;',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('sql-drop-table')
    })

    it('triggers for DELETE without WHERE', () => {
      const ctx = createContext({
        command: 'DELETE FROM users;',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('sql-delete-no-where')
    })

    it('triggers for system file modification', () => {
      const ctx = createContext({
        command: 'chmod 777 /etc/passwd',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('system-file-modification')
    })

    it('triggers for terraform destroy', () => {
      const ctx = createContext({
        command: 'terraform destroy',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('terraform-destroy')
    })

    it('triggers for kubectl delete namespace', () => {
      const ctx = createContext({
        command: 'kubectl delete namespace production',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('k8s-delete-namespace')
    })

    it('triggers for npm publish', () => {
      const ctx = createContext({
        command: 'npm publish',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('npm-publish')
    })

    it('does not trigger for git push --force to feature branch', () => {
      const ctx = createContext({
        command: 'git push origin feature-branch --force',
        riskLevel: 'high',
      })
      const result = evaluateCircuitBreakers(ctx)
      // Should trigger the general git-force-push-any breaker
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('git-force-push-any')
    })

    it('respects permission mode condition for git-force-push-any', () => {
      const ctx = createContext({
        command: 'git push origin feature --force',
        riskLevel: 'high',
        permissionMode: 'bypass',
      })
      const result = evaluateCircuitBreakers(ctx)
      // Should not trigger in bypass mode due to condition
      expect(result.triggered).toBe(false)
    })

    it('respects risk threshold', () => {
      // High threshold breaker should not trigger for medium risk
      const ctx = createContext({ command: 'npm install', riskLevel: 'medium' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(false)
    })

    it('returns message with details', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.message).toBeDefined()
      expect(result.message).toContain('Circuit breaker triggered')
      expect(result.message).toContain('rm -rf /')
      expect(result.message).toContain('critical')
    })

    it('returns highest priority breaker when multiple match', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'critical' })
      // Both rm-rf-root (100) and disk-destructive (85) could match
      const result = evaluateCircuitBreakers(ctx)
      expect(result.breaker?.id).toBe('rm-rf-root') // Higher priority
    })
  })

  describe('isCircuitBreakerTriggered', () => {
    it('convenience function works', () => {
      const result = isCircuitBreakerTriggered('rm -rf /', 'critical', 'default')
      expect(result.triggered).toBe(true)
    })
  })

  describe('addCircuitBreaker', () => {
    it('adds custom breaker', () => {
      const customBreaker: CircuitBreakerTrigger = {
        id: 'custom-test',
        name: 'Custom Test',
        description: 'Test breaker',
        riskThreshold: 'high',
        patterns: [/^custom-dangerous/],
        action: 'prompt',
        priority: 200,
      }
      const newBreakers = addCircuitBreaker(DEFAULT_CIRCUIT_BREAKERS, customBreaker)
      expect(newBreakers.length).toBe(DEFAULT_CIRCUIT_BREAKERS.length + 1)
      expect(newBreakers[0].id).toBe('custom-test') // Highest priority first
    })
  })

  describe('removeCircuitBreaker', () => {
    it('removes breaker by ID', () => {
      const newBreakers = removeCircuitBreaker(DEFAULT_CIRCUIT_BREAKERS, 'rm-rf-root')
      expect(newBreakers.length).toBe(DEFAULT_CIRCUIT_BREAKERS.length - 1)
      expect(newBreakers.find((b) => b.id === 'rm-rf-root')).toBeUndefined()
    })
  })

  describe('setCircuitBreakerEnabled', () => {
    it('disables a breaker', () => {
      const newBreakers = setCircuitBreakerEnabled(DEFAULT_CIRCUIT_BREAKERS, 'rm-rf-root', false)
      const disabled = newBreakers.find((b) => b.id === 'rm-rf-root')
      expect(disabled?.enabled).toBe(false)
    })

    it('enables a breaker', () => {
      const disabled = setCircuitBreakerEnabled(DEFAULT_CIRCUIT_BREAKERS, 'rm-rf-root', false)
      const enabled = setCircuitBreakerEnabled(disabled, 'rm-rf-root', true)
      const breaker = enabled.find((b) => b.id === 'rm-rf-root')
      expect(breaker?.enabled).toBe(true)
    })
  })

  describe('getEnabledCircuitBreakers', () => {
    it('filters to enabled only', () => {
      const withDisabled = setCircuitBreakerEnabled(DEFAULT_CIRCUIT_BREAKERS, 'rm-rf-root', false)
      const enabled = getEnabledCircuitBreakers(withDisabled)
      expect(enabled.find((b) => b.id === 'rm-rf-root')).toBeUndefined()
      expect(enabled.length).toBe(DEFAULT_CIRCUIT_BREAKERS.length - 1)
    })
  })

  describe('shouldOverrideBypass', () => {
    it('returns true for critical breakers in bypass mode', () => {
      const ctx = createContext({
        command: 'rm -rf /',
        riskLevel: 'critical',
        permissionMode: 'bypass',
      })
      expect(shouldOverrideBypass(ctx)).toBe(true)
    })

    it('returns false for low risk in bypass mode', () => {
      const ctx = createContext({
        command: 'ls',
        riskLevel: 'low',
        permissionMode: 'bypass',
      })
      expect(shouldOverrideBypass(ctx)).toBe(false)
    })

    it('returns false for deny action', () => {
      const ctx = createContext({
        command: ':(){ :|:& };:',
        riskLevel: 'critical',
        permissionMode: 'bypass',
      })
      // fork-bomb has action 'deny'
      expect(shouldOverrideBypass(ctx)).toBe(false)
    })
  })

  describe('previewCircuitBreakers', () => {
    it('returns all matching breakers', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'critical' })
      const breakers = previewCircuitBreakers(ctx)
      expect(breakers.length).toBeGreaterThan(0)
      expect(breakers.map((b) => b.id)).toContain('rm-rf-root')
      // rm-rf-root handles rm -rf /, disk-destructive handles dd, mkfs, etc.
    })

    it('returns empty for non-matching', () => {
      const ctx = createContext({ command: 'ls', riskLevel: 'low' })
      const breakers = previewCircuitBreakers(ctx)
      expect(breakers.length).toBe(0)
    })

    it('respects conditions', () => {
      const ctx = createContext({
        command: 'git push origin feature --force',
        riskLevel: 'high',
        permissionMode: 'bypass',
      })
      const breakers = previewCircuitBreakers(ctx)
      // git-force-push-any has condition that prevents it in bypass mode
      expect(breakers.find((b) => b.id === 'git-force-push-any')).toBeUndefined()
    })
  })

  describe('integration with risk levels', () => {
    it('low risk never triggers critical breakers', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'low' }) // Misclassified
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(false)
    })

    it('high risk triggers high threshold breakers', () => {
      const ctx = createContext({ command: 'terraform destroy', riskLevel: 'high' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.riskThreshold).toBe('high')
    })

    it('critical risk triggers all thresholds', () => {
      const ctx = createContext({ command: 'rm -rf /', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(['critical', 'high'].includes(result.breaker?.riskThreshold || '')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles empty command', () => {
      const ctx = createContext({ command: '', riskLevel: 'low' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(false)
    })

    it('handles commands with pipes', () => {
      const ctx = createContext({ command: 'echo test | rm -rf /', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
    })

    it('handles sudo prefixed commands', () => {
      const ctx = createContext({ command: 'sudo rm -rf /', riskLevel: 'critical' })
      const result = evaluateCircuitBreakers(ctx)
      expect(result.triggered).toBe(true)
      expect(result.breaker?.id).toBe('rm-rf-root')
    })
  })
})
