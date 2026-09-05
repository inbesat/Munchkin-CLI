import { describe, expect, it } from 'bun:test'
import {
  themes,
  getTheme,
  listThemeModes,
  listThemeNames,
  nextThemeMode,
  daltonizedLightTheme,
  type ThemeMode,
} from './themes'
import {
  simulateColorBlindness,
  mergeThemeColors,
  resolveTheme,
  isValidThemeColors,
  themeToCssVars,
  type ColorBlindnessType,
} from './apply'
import {
  validateCustomTheme,
  loadCustomThemeFromObject,
  loadCustomThemeFromFile,
  type CustomThemeConfig,
} from './custom'

describe('built-in themes', () => {
  it('has all four themes', () => {
    const modes = listThemeModes()
    expect(modes).toEqual(['dark', 'light', 'daltonized', 'daltonized-light'])
  })

  it('getTheme resolves each mode', () => {
    for (const mode of listThemeModes()) {
      expect(getTheme(mode).mode).toBe(mode)
    }
  })

  it('daltonized-light exists and is light-based', () => {
    expect(themes['daltonized-light']).toBe(daltonizedLightTheme)
    expect(daltonizedLightTheme.colors.background).toBe('#ffffff')
    expect(daltonizedLightTheme.colors.primary).toBe('#00856f')
  })

  it('every theme has valid colors', () => {
    for (const mode of listThemeModes()) {
      expect(isValidThemeColors(themes[mode].colors)).toBe(true)
    }
  })

  it('listThemeNames returns friendly names', () => {
    const names = listThemeNames()
    expect(names.length).toBe(4)
    expect(names[0].name).toBe('Dark')
  })

  it('cycles through themes', () => {
    expect(nextThemeMode('dark')).toBe('light')
    expect(nextThemeMode('daltonized-light')).toBe('dark')
  })
})

describe('colorblind simulation', () => {
  const types: ColorBlindnessType[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia']
  it('returns input for none', () => {
    expect(simulateColorBlindness('#58a6ff', 'none')).toBe('#58a6ff')
  })
  for (const t of types.filter((x) => x !== 'none')) {
    it(`changes color for ${t}`, () => {
      const out = simulateColorBlindness('#58a6ff', t)
      expect(out).not.toBe('#58a6ff')
      expect(/^#[0-9a-f]{6}$/i.test(out)).toBe(true)
    })
  }
  it('handles invalid hex gracefully', () => {
    expect(simulateColorBlindness('not-a-color', 'protanopia')).toBe('not-a-color')
  })
})

describe('theme application', () => {
  it('merges color overrides', () => {
    const merged = mergeThemeColors(themes.dark.colors, { primary: '#123456' })
    expect(merged.primary).toBe('#123456')
    expect(merged.background).toBe(themes.dark.colors.background)
  })

  it('resolves custom theme by mode', () => {
    const custom = loadCustomThemeFromObject({ name: 'My', mode: 'dark', colors: { primary: '#abcdef' } })
    expect(resolveTheme('dark', [custom]).colors.primary).toBe('#abcdef')
  })

  it('falls back to built-in when no custom matches', () => {
    const custom = loadCustomThemeFromObject({ name: 'My', mode: 'light' })
    expect(resolveTheme('dark', [custom]).colors.background).toBe(themes.dark.colors.background)
  })

  it('converts theme to css vars', () => {
    const vars = themeToCssVars(themes.dark)
    expect(vars['--forge-background']).toBe('#0d1117')
    expect(vars['--forge-mode']).toBe('dark')
  })
})

describe('custom themes', () => {
  const valid: CustomThemeConfig = {
    name: 'Sunset',
    extends: 'dark',
    colors: { accent: '#ff00ff' },
  }

  it('validates a good config', () => {
    expect(validateCustomTheme(valid).valid).toBe(true)
  })

  it('rejects missing name', () => {
    const res = validateCustomTheme({ colors: {} })
    expect(res.valid).toBe(false)
    expect(res.errors.join()).toContain('name')
  })

  it('rejects invalid extends', () => {
    const res = validateCustomTheme({ name: 'x', extends: 'rainbow' })
    expect(res.valid).toBe(false)
  })

  it('rejects invalid hex colors', () => {
    const res = validateCustomTheme({ name: 'x', colors: { accent: 'nothex' } })
    expect(res.valid).toBe(false)
  })

  it('loads from object and merges onto base', () => {
    const theme = loadCustomThemeFromObject(valid)
    expect(theme.name).toBe('Sunset')
    expect(theme.colors.accent).toBe('#ff00ff')
    expect(theme.colors.background).toBe(themes.dark.colors.background)
    expect(theme.mode).toBe('dark')
  })

  it('loads from a JSON file', async () => {
    const { tmpdir } = await import('node:os')
    const tmp = `${tmpdir()}/opencode-custom-theme-${Date.now()}.json`
    await Bun.write(tmp, JSON.stringify(valid))
    const theme = await loadCustomThemeFromFile(tmp)
    expect(theme.name).toBe('Sunset')
  })
})
