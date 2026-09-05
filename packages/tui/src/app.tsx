import React, { useState, useEffect, useCallback, useRef } from 'react'
import { render, Box, Text, useInput, useFocus } from 'ink'
import { ThemeProvider, useTheme, useThemeColors, themes, ThemeMode } from './theme'
import { getKeyboardManager, KeyboardManager, createDefaultBindings, formatKey } from './keyboard'
import { MainLayout, ChatMessage, SidebarItem } from './layout/main'

/** App state. */
interface AppState {
  messages: ChatMessage[]
  sidebarItems: SidebarItem[]
  inputValue: string
  sidebarOpen: boolean
  themeMode: ThemeMode
  loading: boolean
  error: string | null
  sidebarWidth: number
}

/** Create initial app state. */
function createInitialState(): AppState {
  return {
    messages: [
      {
        id: 'welcome',
        role: 'system',
        content: 'Welcome to forge! Press SPACE for commands, F1 for help.',
        timestamp: new Date(),
      },
    ],
    sidebarItems: [
      { id: 'chat-1', label: 'Main Chat', icon: '💬', onClick: () => {} },
      { id: 'chat-2', label: 'Code Review', icon: '🔍', onClick: () => {} },
      { id: 'settings', label: 'Settings', icon: '⚙️', onClick: () => {} },
    ],
    inputValue: '',
    sidebarOpen: true,
    themeMode: 'dark',
    loading: false,
    error: null,
    sidebarWidth: 30,
  }
}

/** Main app component. */
export function App() {
  const [state, setState] = useState<AppState>(createInitialState)
  const [showHelp, setShowHelp] = useState(false)
  const colors = useThemeColors()
  const keyboardManager = getKeyboardManager()
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Register default key bindings
  useEffect(() => {
    const bindings = createDefaultBindings({
      toggleSidebar: () => setState((s) => ({ ...s, sidebarOpen: !s.sidebarOpen })),
      toggleTheme: () => {
        setState((s) => {
          const modes: ThemeMode[] = ['dark', 'light', 'daltonized', 'daltonized-light']
          const idx = modes.indexOf(s.themeMode)
          return { ...s, themeMode: modes[(idx + 1) % modes.length] }
        })
      },
      newChat: () => {
        setState((s) => ({ ...s, messages: s.messages.slice(0, 1) }))
      },
      openSettings: () => {
        setState((s) => ({ ...s, error: 'Settings not implemented yet' }))
      },
      openHelp: () => setShowHelp(true),
      quit: () => process.exit(0),
      focusInput: () => { /* handled by layout */ },
      focusChat: () => { /* handled by layout */ },
      focusSidebar: () => { /* handled by layout */ },
      nextTab: () => { /* tab navigation */ },
      prevTab: () => { /* tab navigation */ },
      closeTab: () => { /* tab navigation */ },
      copyCode: () => { /* copy code block */ },
      interrupt: () => setState((s) => ({ ...s, loading: false })),
      retry: () => { /* retry last operation */ },
    })
    keyboardManager.registerAll(bindings)

    return () => {
      for (const binding of bindings) {
        keyboardManager.unregister(binding.combo)
      }
    }
  }, [])

  // Handle input changes
  const handleInputChange = useCallback((value: string) => {
    setState((s) => ({ ...s, inputValue: value }))
  }, [])

  // Handle input submit
  const handleInputSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: value,
      timestamp: new Date(),
    }

    setState((s) => ({
      ...s,
      messages: [...s.messages, userMessage],
      inputValue: '',
      loading: true,
      error: null,
    }))

    // Simulate assistant response
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `You said: "${value}". This is a simulated response from the assistant.`,
        timestamp: new Date(),
      }

      setState((s) => ({
        ...s,
        messages: [...s.messages, assistantMessage],
        loading: false,
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  // Handle toggle sidebar
  const handleToggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }))
  }, [])

  // Handle toggle theme
  const handleToggleTheme = useCallback(() => {
    setState((s) => {
      const modes: ThemeMode[] = ['dark', 'light', 'daltonized', 'daltonized-light']
      const idx = modes.indexOf(s.themeMode)
      return { ...s, themeMode: modes[(idx + 1) % modes.length] }
    })
  }, [])

  // Handle toggle help
  const handleToggleHelp = useCallback(() => {
    setShowHelp((prev) => !prev)
  }, [])

  // Global key handler for F1 and ESC
  useInput((key, modifiers) => {
    if (key === 'f1') {
      setShowHelp(true)
      return true
    }
    if (key === 'escape') {
      if (showHelp) {
        setShowHelp(false)
      } else if (state.inputValue) {
        setState((s) => ({ ...s, inputValue: '' }))
      }
      return true
    }
    if (key === 'c' && modifiers.ctrl) {
      process.exit(0)
      return true
    }
    return false
  })

  return (
    <ThemeProvider initialMode={state.themeMode}>
      <MainLayout
        messages={state.messages}
        sidebarItems={state.sidebarItems}
        inputValue={state.inputValue}
        inputPlaceholder="Type a message... (Enter to send, Shift+Enter for newline)"
        inputFocused={true}
        onInputChange={handleInputChange}
        onInputSubmit={handleInputSubmit}
        sidebarWidth={state.sidebarWidth}
        sidebarOpen={state.sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        themeMode={state.themeMode}
        onToggleTheme={handleToggleTheme}
        statusLeft={
          <>
            <Box flexDirection="row" alignItems="center">
              <Text color={state.loading ? '#d29922' : '#3fb950'}>●</Text>
              <Box marginLeft={1}>
                <Text color={state.loading ? '#d29922' : '#3fb950'}>
                  {state.loading ? 'Processing...' : 'Ready'}
                </Text>
              </Box>
            </Box>
          </>
        }
        statusRight={
          <>
            <Text color={colors.textMuted}>{state.themeMode.toUpperCase()}</Text>
          </>
        }
        loading={state.loading}
        error={state.error ?? undefined}
      />
    </ThemeProvider>
  )
}

/** Run the app. */
export function runApp() {
  render(<App />, { exitOnCtrlC: false })
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runApp()
}