export {
  ThemeProvider,
  useTheme,
  useThemeColors,
  useThemeMode,
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
} from './theme'
export {
  simulateColorBlindness,
  mergeThemeColors,
  resolveTheme,
  isValidThemeColors,
  themeToCssVars,
  applyThemeVars,
  type ColorBlindnessType,
} from './theme'
export {
  loadCustomThemeFromObject,
  loadCustomThemeFromFile,
  validateCustomTheme,
  type CustomThemeConfig,
} from './theme'
export {
  getKeyboardManager,
  setKeyboardManager,
  clearKeyboardManager,
  useKeyboardManager,
  useKeyBindings,
  useInputHandler,
  KeyboardManager,
  createDefaultBindings,
  formatKey,
  parseKittyKey,
  KITTY_ENABLE,
  KITTY_DISABLE,
  parseMouseSGR,
  MOUSE_ENABLE,
  MOUSE_DISABLE,
  type KeyCombo,
  type KeyBinding,
  type KittyKey,
  type MouseEvent,
  type MouseButton,
  type MouseAction,
} from './keyboard'
export { MainLayout, type ChatMessage, type SidebarItem, type MainLayoutProps } from './layout/main'
export { runApp, App } from './app'
export {
  StreamingMarkdown,
  Markdown,
  CodeBlock,
  InlineCode,
  useSyntaxHighlighter,
  StreamingMarkdownParser,
  type MarkdownToken,
  type MarkdownTokenType,
} from './components'

export const VERSION = '0.1.0'
