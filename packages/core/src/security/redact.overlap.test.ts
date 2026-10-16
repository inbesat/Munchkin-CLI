import { describe, expect, it } from 'bun:test'
import { redact } from './redact'

describe('redact multiple distinct secrets', () => {
  it('redacts every secret regardless of their order in the text', () => {
    const openAi = `sk-${'a'.repeat(48)}`
    const github = `ghp_${'g'.repeat(36)}`
    const result = redact(`key1=${openAi} key2=${github}`)

    expect(result.text).not.toContain(openAi)
    expect(result.text).not.toContain(github)
    expect(result.count).toBe(2)
  })

  it('redacts every secret when the GitHub token comes first', () => {
    const openAi = `sk-${'b'.repeat(48)}`
    const github = `ghp_${'h'.repeat(36)}`
    const result = redact(`first=${github} second=${openAi}`)

    expect(result.text).not.toContain(github)
    expect(result.text).not.toContain(openAi)
    expect(result.count).toBe(2)
  })

  it('redacts a secret appearing after an env-var style secret', () => {
    const value = 'supersecretvalue123'
    const github = `ghp_${'k'.repeat(36)}`
    const result = redact(`password=${value} token=${github}`)

    expect(result.text).not.toContain(value)
    expect(result.text).not.toContain(github)
    expect(result.count).toBeGreaterThanOrEqual(2)
  })
})
