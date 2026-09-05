import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthFlowError } from './errors'
import { FileTokenVault, isExpired, validateTokens } from './tokens'

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'forge-vault-')), 'credentials.json')
}

describe('FileTokenVault', () => {
  it('round-trips tokens through a JSON file', () => {
    const vault = new FileTokenVault(tempFile())
    vault.save({
      provider: 'claude',
      accessToken: 'sk-ant',
      refreshToken: 'sk-refresh',
      expiresAt: 123,
    })
    expect(vault.load('claude')?.accessToken).toBe('sk-ant')
    expect(vault.load('claude')?.refreshToken).toBe('sk-refresh')
    expect(vault.load('copilot')).toBeNull()
  })

  it('clears a single provider without touching the others', () => {
    const vault = new FileTokenVault(tempFile())
    vault.save({ provider: 'claude', accessToken: 'a' })
    vault.save({ provider: 'chatgpt', accessToken: 'b' })
    vault.clear('claude')
    expect(vault.load('claude')).toBeNull()
    expect(vault.load('chatgpt')?.accessToken).toBe('b')
  })

  it('returns null on a missing file', () => {
    const vault = new FileTokenVault(join(tempFile(), 'nope', 'missing.json'))
    expect(vault.load('claude')).toBeNull()
  })

  it('treats a corrupt file as an AuthFlowError on read', () => {
    const path = tempFile()
    writeFileSync(path, '{not json', 'utf8')
    const vault = new FileTokenVault(path)
    expect(() => vault.load('claude')).toThrow(AuthFlowError)
    expect(() => vault.load('claude')).toThrow(/Corrupt credential store/)
  })

  it('persists an empty object after remove()', () => {
    const vault = new FileTokenVault(tempFile())
    vault.save({ provider: 'claude', accessToken: 'a' })
    vault.remove()
    expect(vault.load('claude')).toBeNull()
  })
})

describe('token helpers', () => {
  it('validateTokens throws when nothing is stored', () => {
    expect(() => validateTokens('claude', null)).toThrow(/No saved credentials/)
  })

  it('isExpired respects an expiry skew', () => {
    expect(isExpired({ provider: 'claude', accessToken: 'a' })).toBe(false)
    expect(isExpired({ provider: 'claude', accessToken: 'a', expiresAt: Date.now() - 1 })).toBe(
      true,
    )
    expect(
      isExpired({ provider: 'claude', accessToken: 'a', expiresAt: Date.now() + 120_000 }),
    ).toBe(false)
  })
})
