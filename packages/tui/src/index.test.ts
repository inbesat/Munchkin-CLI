import { describe, expect, it } from 'bun:test'
import { VERSION } from './index'

describe('@forge/tui', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0')
  })
})
