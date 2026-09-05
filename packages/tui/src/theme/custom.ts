import {
  themes,
  type Theme,
  type ThemeMode,
  type ThemeColors,
} from './themes'
import { isValidThemeColors, mergeThemeColors } from './apply'

/** Shape of a custom theme config (from JSON or object). */
export interface CustomThemeConfig {
  name: string
  mode?: ThemeMode
  extends?: ThemeMode
  colors?: Partial<ThemeColors>
}

/** Validate a custom theme config, returning errors for the caller to surface. Pure. */
export function validateCustomTheme(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Custom theme must be an object'] }
  }
  const c = config as Record<string, unknown>
  if (typeof c.name !== 'string' || c.name.trim().length === 0) {
    errors.push('Custom theme requires a non-empty "name"')
  }
  if (c.extends !== undefined && c.extends !== null) {
    if (typeof c.extends !== 'string' || !(c.extends in themes)) {
      errors.push(`Unknown "extends" mode: ${String(c.extends)}`)
    }
  }
  if (c.colors !== undefined) {
    if (typeof c.colors !== 'object' || c.colors === null) {
      errors.push('"colors" must be an object')
    } else {
      const base = themes[(c.extends as ThemeMode) ?? 'dark'].colors
      const merged = { ...base, ...(c.colors as Partial<ThemeColors>) }
      if (!isValidThemeColors(merged)) {
        errors.push('"colors" contains invalid hex values')
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

/** Build a Theme from a custom config, merging onto a base palette. Pure. */
export function loadCustomThemeFromObject(config: CustomThemeConfig): Theme {
  const baseMode: ThemeMode = config.extends ?? 'dark'
  const base = themes[baseMode]
  const colors = mergeThemeColors(base.colors, config.colors ?? {})
  return {
    mode: config.mode ?? baseMode,
    name: config.name,
    colors,
  }
}

/** Load and validate a custom theme from a JSON file path. */
export async function loadCustomThemeFromFile(path: string): Promise<Theme> {
  const file = Bun.file(path)
  const text = await file.text()
  const parsed = JSON.parse(text) as unknown
  const { valid, errors } = validateCustomTheme(parsed)
  if (!valid) {
    throw new Error(`Invalid custom theme in ${path}: ${errors.join('; ')}`)
  }
  return loadCustomThemeFromObject(parsed as CustomThemeConfig)
}
