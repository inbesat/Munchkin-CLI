import { describe, expect, it } from 'bun:test'
import { validateCustomTheme } from './custom'

describe('custom theme validation', () => {
  it.each(['missing', 'toString', '__proto__'])('returns errors instead of throwing for extends=%s', (mode) => {
    expect(validateCustomTheme({ name: 'invalid', extends: mode, colors: {} }).valid).toBe(false)
  })
})
