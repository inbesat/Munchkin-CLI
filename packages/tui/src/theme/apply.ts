import {
  themes,
  type Theme,
  type ThemeMode,
  type ThemeColors,
} from './themes'

export type ColorBlindnessType = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'

const MATRICES: Record<Exclude<ColorBlindnessType, 'none'>, number[][]> = {
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525],
  ],
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Apply a colorblindness simulation to a single hex color. Pure. */
export function simulateColorBlindness(hex: string, type: ColorBlindnessType): string {
  if (type === 'none') return hex
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb
  const matrix = MATRICES[type]
  const nr = matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b
  const ng = matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b
  const nb = matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b
  return rgbToHex(nr, ng, nb)
}

/** Merge a partial color override onto a base palette. Pure. */
export function mergeThemeColors(base: ThemeColors, override: Partial<ThemeColors>): ThemeColors {
  return { ...base, ...override }
}

/** Resolve a theme by mode, preferring a custom theme with the same mode. Pure. */
export function resolveTheme(mode: ThemeMode, custom?: Theme[]): Theme {
  if (custom && custom.length > 0) {
    const match = custom.find((t) => t.mode === mode)
    if (match) return match
  }
  return themes[mode]
}

const REQUIRED_COLOR_KEYS: Array<keyof ThemeColors> = [
  'background',
  'surface',
  'surfaceElevated',
  'border',
  'borderFocus',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'textInverse',
  'primary',
  'primaryHover',
  'secondary',
  'accent',
  'success',
  'warning',
  'error',
  'info',
  'codeBackground',
  'codeForeground',
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'variable',
  'type',
  'selection',
  'cursor',
  'scrollbar',
  'scrollbarHover',
]

function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())
}

/** Validate that an object is a complete ThemeColors palette. Pure. */
export function isValidThemeColors(obj: unknown): obj is ThemeColors {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return REQUIRED_COLOR_KEYS.every((k) => isHex(o[k]))
}

/** Map a theme to a flat CSS-variable record (for hot-reload into a DOM). Pure. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--forge-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = value
  }
  vars['--forge-mode'] = theme.mode
  return vars
}

/** Apply a theme's CSS variables onto an element-like target (document root). */
export function applyThemeVars(theme: Theme, target?: { setAttribute?: (k: string, v: string) => void }): Record<string, string> {
  const vars = themeToCssVars(theme)
  if (target?.setAttribute) {
    target.setAttribute('data-theme', theme.mode)
  }
  return vars
}
