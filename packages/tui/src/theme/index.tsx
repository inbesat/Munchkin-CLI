import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  themes,
  nextThemeMode,
  type Theme,
  type ThemeMode,
  type ThemeColors,
} from './themes'
import { applyThemeVars } from './apply'

export {
  themes,
  darkTheme,
  lightTheme,
  daltonizedTheme,
  daltonizedLightTheme,
  getTheme,
  listThemeModes,
  listThemeNames,
  nextThemeMode,
  type Theme,
  type ThemeMode,
  type ThemeColors,
} from './themes'
export {
  simulateColorBlindness,
  mergeThemeColors,
  resolveTheme,
  isValidThemeColors,
  themeToCssVars,
  applyThemeVars,
  type ColorBlindnessType,
} from './apply'
export {
  loadCustomThemeFromObject,
  loadCustomThemeFromFile,
  validateCustomTheme,
  type CustomThemeConfig,
} from './custom'

/** Theme context. */
interface ThemeContextValue {
  theme: Theme
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

/** Theme context. */
const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Theme provider props. */
interface ThemeProviderProps {
  children: React.ReactNode
  initialMode?: ThemeMode
  storageKey?: string
}

/** Theme provider component. */
export function ThemeProvider({
  children,
  initialMode = 'dark',
  storageKey = 'forge-theme',
}: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey) as ThemeMode | null
      if (stored && themes[stored]) return stored
    }
    return initialMode
  })

  const theme = themes[mode]

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, mode)
      document.documentElement.setAttribute('data-theme', mode)
    }
    // Apply CSS variables for DOM consumers (hot-reload safe).
    applyThemeVars(theme, typeof window !== 'undefined' ? (document.documentElement as unknown as { setAttribute?: (k: string, v: string) => void }) : undefined)
  }, [mode, storageKey, theme])

  const toggleTheme = useCallback(() => {
    setMode((current) => nextThemeMode(current))
  }, [])

  const value: ThemeContextValue = {
    theme,
    mode,
    setMode,
    toggleTheme,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Hook to use theme. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

/** Hook to get just the current theme colors. */
export function useThemeColors(): ThemeColors {
  return useTheme().theme.colors
}

/** Hook to get the current theme mode. */
export function useThemeMode(): ThemeMode {
  return useTheme().mode
}

/** Create a styled component with theme colors. */
export function createThemedComponent<T extends React.ComponentType<any>>(
  component: T,
  styleFn: (colors: ThemeColors) => React.CSSProperties,
): T {
  const ThemedComponent = (props: any) => {
    const colors = useThemeColors()
    return React.createElement(component, { ...props, style: { ...props.style, ...styleFn(colors) } })
  }
  ThemedComponent.displayName = `Themed(${component.displayName || component.name || 'Component'})`
  return ThemedComponent as T
}
