import { describe, expect, it } from 'bun:test'
import { parseKittyKey, KITTY_ENABLE, KITTY_DISABLE } from './kitty'
import { parseMouseSGR, MOUSE_ENABLE, MOUSE_DISABLE } from './mouse'

describe('Kitty keyboard protocol', () => {
  it('exposes enable/disable sequences', () => {
    expect(KITTY_ENABLE).toBe('\x1b[>1u')
    expect(KITTY_DISABLE).toBe('\x1b[>0u')
  })

  it('parses a plain letter', () => {
    const k = parseKittyKey('[97;0u')
    expect(k?.key).toBe('a')
    expect(k?.ctrl).toBe(false)
    expect(k?.named).toBe(false)
  })

  it('parses Tab as a named key (disambiguated from Ctrl+I)', () => {
    const tab = parseKittyKey('[9;0;2u')
    expect(tab?.key).toBe('Tab')
    expect(tab?.named).toBe(true)

    const ctrlI = parseKittyKey('[105;4u')
    expect(ctrlI?.key).toBe('i')
    expect(ctrlI?.ctrl).toBe(true)
    expect(ctrlI?.named).toBe(false)
  })

  it('parses Enter with alt', () => {
    const k = parseKittyKey('[13;2u')
    expect(k?.key).toBe('Enter')
    expect(k?.alt).toBe(true)
    expect(k?.shift).toBe(false)
  })

  it('parses arrow keys', () => {
    expect(parseKittyKey('[57393;0u')?.key).toBe('ArrowUp')
    expect(parseKittyKey('[57396;0u')?.key).toBe('ArrowLeft')
  })

  it('returns null for non-protocol sequences', () => {
    expect(parseKittyKey('[1;2H')).toBeNull()
    expect(parseKittyKey('abc')).toBeNull()
  })
})

describe('SGR mouse protocol', () => {
  it('exposes enable/disable sequences', () => {
    expect(MOUSE_ENABLE).toBe('\x1b[?1006h')
    expect(MOUSE_DISABLE).toBe('\x1b[?1006l')
  })

  it('parses left-button press', () => {
    const e = parseMouseSGR('\x1b[<0;40;12M')
    expect(e?.action).toBe('press')
    expect(e?.button).toBe('left')
    expect(e?.x).toBe(40)
    expect(e?.y).toBe(12)
  })

  it('parses right-button with modifiers', () => {
    const e = parseMouseSGR('\x1b[<2;5;6M')
    expect(e?.action).toBe('press')
    expect(e?.button).toBe('right')
  })

  it('parses drag (motion button 0 + 32)', () => {
    const e = parseMouseSGR('\x1b[<32;10;10M')
    expect(e?.action).toBe('drag')
    expect(e?.button).toBe('left')
  })

  it('parses wheel up/down', () => {
    expect(parseMouseSGR('\x1b[<64;1;1M')?.action).toBe('wheel-up')
    expect(parseMouseSGR('\x1b[<65;1;1M')?.action).toBe('wheel-down')
  })

  it('parses release', () => {
    const e = parseMouseSGR('\x1b[<0;3;4m')
    expect(e?.action).toBe('release')
    expect(e?.button).toBeNull()
  })

  it('returns null for non-SGR sequences', () => {
    expect(parseMouseSGR('\x1b[<0;1;1')).toBeNull()
    expect(parseMouseSGR('hello')).toBeNull()
  })
})
