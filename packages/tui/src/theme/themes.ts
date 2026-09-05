/** Theme mode selector. */
export type ThemeMode = 'dark' | 'light' | 'daltonized' | 'daltonized-light'

/** Color palette for a theme. */
export interface ThemeColors {
  // Base colors
  background: string
  surface: string
  surfaceElevated: string
  border: string
  borderFocus: string

  // Text colors
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverse: string

  // Accent colors
  primary: string
  primaryHover: string
  secondary: string
  accent: string

  // Status colors
  success: string
  warning: string
  error: string
  info: string

  // Code/syntax colors
  codeBackground: string
  codeForeground: string
  keyword: string
  string: string
  number: string
  comment: string
  function: string
  variable: string
  type: string

  // UI specific
  selection: string
  cursor: string
  scrollbar: string
  scrollbarHover: string
}

/** Theme configuration. */
export interface Theme {
  mode: ThemeMode
  name: string
  colors: ThemeColors
}

/** Default dark theme. */
export const darkTheme: Theme = {
  mode: 'dark',
  name: 'Dark',
  colors: {
    background: '#0d1117',
    surface: '#161b22',
    surfaceElevated: '#21262d',
    border: '#30363d',
    borderFocus: '#58a6ff',

    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    textInverse: '#0d1117',

    primary: '#58a6ff',
    primaryHover: '#79b8ff',
    secondary: '#8b949e',
    accent: '#f78166',

    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
    info: '#58a6ff',

    codeBackground: '#161b22',
    codeForeground: '#e6edf3',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79b8ff',
    comment: '#8b949e',
    function: '#d2a8ff',
    variable: '#ffa657',
    type: '#ff7b72',

    selection: '#264f78',
    cursor: '#58a6ff',
    scrollbar: '#21262d',
    scrollbarHover: '#30363d',
  },
}

/** Default light theme. */
export const lightTheme: Theme = {
  mode: 'light',
  name: 'Light',
  colors: {
    background: '#ffffff',
    surface: '#f6f8fa',
    surfaceElevated: '#ffffff',
    border: '#d0d7de',
    borderFocus: '#0969da',

    textPrimary: '#24292f',
    textSecondary: '#57606a',
    textMuted: '#6e7781',
    textInverse: '#ffffff',

    primary: '#0969da',
    primaryHover: '#0550ae',
    secondary: '#57606a',
    accent: '#bc4c00',

    success: '#1a7f37',
    warning: '#9a6700',
    error: '#cf222e',
    info: '#0969da',

    codeBackground: '#f6f8fa',
    codeForeground: '#24292f',
    keyword: '#cf222e',
    string: '#0a3069',
    number: '#0550ae',
    comment: '#6e7781',
    function: '#8250df',
    variable: '#953800',
    type: '#cf222e',

    selection: '#cce5ff',
    cursor: '#0969da',
    scrollbar: '#e1e4e8',
    scrollbarHover: '#c9cdd4',
  },
}

/** Daltonized (dark) theme — colorblind-safe colors on a dark base. */
export const daltonizedTheme: Theme = {
  mode: 'daltonized',
  name: 'Daltonized (Dark)',
  colors: {
    background: '#0d1117',
    surface: '#161b22',
    surfaceElevated: '#21262d',
    border: '#30363d',
    borderFocus: '#00d4aa',

    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    textInverse: '#0d1117',

    primary: '#00d4aa',
    primaryHover: '#00e8bb',
    secondary: '#8b949e',
    accent: '#ffb340',

    success: '#00d4aa',
    warning: '#ffb340',
    error: '#ff6b6b',
    info: '#00d4aa',

    codeBackground: '#161b22',
    codeForeground: '#e6edf3',
    keyword: '#ff6b6b',
    string: '#00d4aa',
    number: '#ffb340',
    comment: '#8b949e',
    function: '#d2a8ff',
    variable: '#ffb340',
    type: '#00d4aa',

    selection: '#1a3a4a',
    cursor: '#00d4aa',
    scrollbar: '#21262d',
    scrollbarHover: '#30363d',
  },
}

/** Daltonized (light) theme — colorblind-safe colors on a light base. */
export const daltonizedLightTheme: Theme = {
  mode: 'daltonized-light',
  name: 'Daltonized (Light)',
  colors: {
    background: '#ffffff',
    surface: '#f6f8fa',
    surfaceElevated: '#ffffff',
    border: '#d0d7de',
    borderFocus: '#00856f',

    textPrimary: '#1b1f24',
    textSecondary: '#4a525c',
    textMuted: '#6e7781',
    textInverse: '#ffffff',

    primary: '#00856f',
    primaryHover: '#006b5a',
    secondary: '#4a525c',
    accent: '#b35a00',

    success: '#00856f',
    warning: '#b35a00',
    error: '#c41f3a',
    info: '#00856f',

    codeBackground: '#f6f8fa',
    codeForeground: '#1b1f24',
    keyword: '#c41f3a',
    string: '#00856f',
    number: '#b35a00',
    comment: '#6e7781',
    function: '#6e2fb0',
    variable: '#b35a00',
    type: '#00856f',

    selection: '#bfe9e0',
    cursor: '#00856f',
    scrollbar: '#e1e4e8',
    scrollbarHover: '#c9cdd4',
  },
}

/** All built-in themes keyed by mode. */
export const themes: Record<ThemeMode, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  daltonized: daltonizedTheme,
  'daltonized-light': daltonizedLightTheme,
}

/** Order used for cycling. */
export const THEME_CYCLE: ThemeMode[] = ['dark', 'light', 'daltonized', 'daltonized-light']

/** Resolve a built-in theme by mode. */
export function getTheme(mode: ThemeMode): Theme {
  return themes[mode]
}

/** List of built-in theme modes. */
export function listThemeModes(): ThemeMode[] {
  return [...THEME_CYCLE]
}

/** Human-readable names for each built-in theme. */
export function listThemeNames(): Array<{ mode: ThemeMode; name: string }> {
  return THEME_CYCLE.map((mode) => ({ mode, name: themes[mode].name }))
}

/** Next theme in the cycle (for hot-reload toggling). */
export function nextThemeMode(current: ThemeMode): ThemeMode {
  const idx = THEME_CYCLE.indexOf(current)
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
}
