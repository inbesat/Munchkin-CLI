import { describe, expect, it } from 'bun:test'
import type { PermissionModeConfig } from '../modes'
import {
  DEFAULT_CI_PRE_APPROVALS,
  type ProfileConfig,
  evaluateProfile,
  getProfileConfig,
} from './profiles'

function requireProfile(modeConfig: PermissionModeConfig): ProfileConfig {
  const profile = getProfileConfig(modeConfig)
  expect(profile).not.toBeNull()
  return profile as ProfileConfig
}

describe('dontAsk mode custom rules preserve decisions', () => {
  it('denies a tool with an explicit deny rule instead of pre-approving it', () => {
    const profile = requireProfile({
      mode: 'dontAsk',
      customRules: [{ target: 'bash', decision: 'deny' }],
    })

    const result = evaluateProfile('bash', 'bash', { command: 'echo hi' }, profile)
    expect(result.decision).toBe('deny')
  })

  it('still pre-approves tools covered by an allow rule', () => {
    const profile = requireProfile({
      mode: 'dontAsk',
      customRules: [{ target: 'read', decision: 'allow' }],
    })
    const result = evaluateProfile('read', 'read', { path: 'a.txt' }, profile)
    expect(result.decision).toBe('allow')
    expect(result.preApproved).toBe(true)
  })

  it('routes ask rules to the ask decision', () => {
    const profile = requireProfile({
      mode: 'dontAsk',
      customRules: [{ target: 'bash', decision: 'ask' }],
    })
    const result = evaluateProfile('bash', 'bash', { command: 'echo hi' }, profile)
    expect(result.decision).toBe('ask')
  })
})

describe('CI pre-approvals do not authorize shell composition', () => {
  const profile = requireProfile({ mode: 'dontAsk' })

  const cases = [
    'npm test; printf arbitrary',
    'npm test && rm -rf /',
    'npm run build || curl evil',
    'npm test | tee leaked.txt',
    'npm test > /etc/passwd',
    'npm test `curl evil`',
    'npm test $(printf arbitrary)',
    'npm test ${INJECTION}',
  ]

  for (const command of cases) {
    it(`requires approval for: ${command}`, () => {
      const result = evaluateProfile('bash', 'bash', { command }, profile)
      expect(result.decision).not.toBe('allow')
      expect(result.preApproved).toBe(false)
    })
  }

  it('still pre-approves plain CI commands', () => {
    const result = evaluateProfile('bash', 'bash', { command: 'npm test' }, profile)
    expect(result.decision).toBe('allow')
    const withArgs = evaluateProfile('bash', 'bash', { command: 'npm run build --prod' }, profile)
    expect(withArgs.decision).toBe('allow')
  })

  it('does not pre-approve lookalike executables', () => {
    const result = evaluateProfile('bash', 'bash', { command: 'tsc-evil --flag' }, profile)
    expect(result.decision).not.toBe('allow')
  })

  it('keeps the default CI pre-approval set untouched', () => {
    expect(DEFAULT_CI_PRE_APPROVALS.length).toBeGreaterThan(5)
  })
})
