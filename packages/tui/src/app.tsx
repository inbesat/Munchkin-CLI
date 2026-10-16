import { join } from 'node:path'
import { Box, Text, render, useInput } from 'ink'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BackgroundTask,
  BackgroundTaskManager,
  ContextBudgeter,
  clearGoal,
  setGoal,
} from '../../core/dist/index'
import {
  type InstalledPlugin,
  MarketplaceClient,
  MarketplaceRegistry,
} from '../../plugin-kernel/dist/index'
import {
  CONNECTOR_PRESETS,
  ConnectorWizard,
  McpConnectionManager,
  McpPresetsConfig,
  connectSpec,
  getPreset,
  installPreset,
} from '../../mcp/dist/index'
import { ContextGrid } from './components/context-grid'
import { createDefaultBindings, getKeyboardManager } from './keyboard'
import { type ChatMessage, MainLayout, type SidebarItem } from './layout/main'
import { type ThemeMode, ThemeProvider, useThemeColors } from './theme'

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
  showContextGrid: boolean
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
    showContextGrid: false,
  }
}

/** Main app component. */
export function App() {
  const [state, setState] = useState<AppState>(createInitialState)
  const [showHelp, setShowHelp] = useState(false)
  const colors = useThemeColors()
  const keyboardManager = getKeyboardManager()
  const chatEndRef = useRef<HTMLDivElement>(null)
  /** Phase 90: live context budget, kept in sync with message state. */
  const budgeterRef = useRef(
    new ContextBudgeter({
      modelInfo: { contextWindow: 200_000, maxOutputTokens: 8192 },
      config: { maxTokens: 200_000, compactionThreshold: 0.8, keepRecentMessages: 10 },
      systemPrompt: 'You are forge.',
    }),
  )
  /** Phase 97: detached background tasks (`/tasks` lists them). */
  const backgroundTasksRef = useRef(new BackgroundTaskManager())
  /** Phase 110: plugin marketplace state. */
  const pluginRegistryRef = useRef(new MarketplaceRegistry(join(process.cwd(), '.forge')))
  const marketplaceSourceRef = useRef<string | null>(null)
  /** Phase 121: MCP connector presets. */
  const mcpPresetsRef = useRef(new McpPresetsConfig(join(process.cwd(), '.forge')))
  /** Phase 122: active connector wizard (null when idle). */
  const wizardRef = useRef<ConnectorWizard | null>(null)
  /** Phase 123: live MCP connections for the health dashboard. */
  const mcpConnectionsRef = useRef(new McpConnectionManager())

  useEffect(() => {
    budgeterRef.current.setConversationHistory(state.messages.map((m) => m.content))
  }, [state.messages])

  /** Append a system message (used by slash-command feedback). */
  const appendSystem = useCallback((content: string) => {
    setState((s) => ({
      ...s,
      inputValue: '',
      messages: [
        ...s.messages,
        { id: `sys-${Date.now()}`, role: 'system' as const, content, timestamp: new Date() },
      ],
    }))
  }, [])

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
      focusInput: () => {
        /* handled by layout */
      },
      focusChat: () => {
        /* handled by layout */
      },
      focusSidebar: () => {
        /* handled by layout */
      },
      nextTab: () => {
        /* tab navigation */
      },
      prevTab: () => {
        /* tab navigation */
      },
      closeTab: () => {
        /* tab navigation */
      },
      copyCode: () => {
        /* copy code block */
      },
      interrupt: () => setState((s) => ({ ...s, loading: false })),
      retry: () => {
        /* retry last operation */
      },
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

    // Slash-command dispatch (Phases 90/97/101/110).
    if (value.startsWith('/')) {
      const command = value.slice(1).trim().split(/\s+/)[0] ?? ''
      const argsText = value.slice(1).trim().slice(command.length).trim()

      if (command === 'context') {
        setState((s) => ({ ...s, showContextGrid: !s.showContextGrid, inputValue: '' }))
        return
      }
      if (command === 'tasks') {
        const tasks: readonly BackgroundTask[] = backgroundTasksRef.current.list()
        appendSystem(
          tasks.length === 0
            ? 'No background tasks.'
            : tasks
                .map((t) => {
                  const suffix =
                    t.status === 'completed' && t.result !== undefined
                      ? ` — ${String(t.result)}`
                      : t.error !== undefined
                        ? ` — ${t.error}`
                        : ''
                  return `[${t.status}] ${t.id}: ${t.description}${suffix}`
                })
                .join('\n'),
        )
        return
      }
      if (command === 'goal') {
        if (argsText === 'clear') {
          clearGoal()
          appendSystem('Goal cleared — autonomous mode stopped.')
          return
        }
        if (argsText.length === 0) {
          appendSystem('Usage: /goal <condition> — or /goal clear')
          return
        }
        setGoal(argsText)
        appendSystem(`Goal set: ${argsText} — ends when the agent reports [GOAL_MET].`)
        return
      }
      if (command === 'mcp') {
        const mcpArgs = argsText.split(/\s+/).filter((arg) => arg.length > 0)
        if (mcpArgs[0] === 'disconnect' && mcpArgs[1] !== undefined) {
          const gone = mcpConnectionsRef.current.disconnect(mcpArgs[1])
          appendSystem(
            gone.ok
              ? `MCP server '${mcpArgs[1]}' disconnected - tool schemas freed.`
              : `mcp: ${gone.error ?? 'disconnect failed'}`,
          )
          return
        }
        if (mcpArgs[0] === 'connect' && mcpArgs[1] !== undefined) {
          const spec = mcpPresetsRef.current.read()[mcpArgs[1]]
          if (spec === undefined) {
            appendSystem(
              `mcp: '${mcpArgs[1]}' is not configured. Install a preset with /connect ${mcpArgs[1]}.`,
            )
            return
          }
          appendSystem(`Connecting to '${mcpArgs[1]}'...`)
          void mcpConnectionsRef.current
            .connect(mcpArgs[1], spec)
            .then((outcome) => {
              appendSystem(
                outcome.ok
                  ? `MCP '${outcome.status.id}': connected to ${outcome.status.serverName ?? 'server'} - ${outcome.status.toolCount} tools (schemas lazy).`
                  : `mcp: connection failed - ${outcome.error}`,
              )
            })
            .catch(() => appendSystem('mcp: connection attempt crashed unexpectedly.'))
          return
        }
        const configured = Object.keys(mcpPresetsRef.current.read())
        const rows = mcpConnectionsRef.current.statuses()
        const lines = [
          'MCP servers:',
          ...rows.map(
            (row) =>
              `  ${row.id}: ${row.state} - ${row.toolCount} tools${row.serverName !== undefined ? ` (${row.serverName})` : ``}${row.lastError !== undefined ? ` - last error: ${row.lastError}` : ''}`,
          ),
          ...configured
            .filter((id) => rows.every((row) => row.id !== id))
            .map((id) => `  ${id}: configured - not connected (use /mcp connect ${id})`),
        ]
        if (lines.length === 1) {
          appendSystem('No MCP servers configured. Install one with /connect <connector>.')
          return
        }
        appendSystem(lines.join('\n'))
        return
      }
      if (command === 'answer') {
        const wizard = wizardRef.current
        if (wizard === null) {
          appendSystem('No wizard in progress. Start one with /connect <connector>.')
          return
        }
        if (argsText === 'cancel') {
          wizardRef.current = null
          appendSystem('Wizard cancelled.')
          return
        }
        const answered = wizard.answer(argsText)
        if (!answered.ok) {
          appendSystem(`wizard: ${answered.error ?? 'invalid answer'}`)
          return
        }
        if (!wizard.isComplete()) {
          appendSystem(wizard.currentPrompt() ?? '')
          return
        }
        const finished = wizard.finish()
        if (!finished.ok) {
          appendSystem(`wizard failed: ${finished.error}`)
          wizardRef.current = null
          return
        }
        mcpPresetsRef.current.set(wizard.preset, finished.spec)
        wizardRef.current = null
        appendSystem(`MCP server '${wizard.preset}' configured. Testing connection...`)
        void connectSpec(finished.spec)
          .then((verified) => {
            appendSystem(
              verified.ok
                ? `Connection verified: '${verified.serverName}' answered the MCP handshake.`
                : `Connection test failed: ${verified.error}`,
            )
          })
          .catch(() => appendSystem('Connection test crashed unexpectedly.'))
        return
      }
      if (command === 'connect') {
        if (argsText === '' || argsText === 'list') {
          const installed = mcpPresetsRef.current.installedIds()
          appendSystem(
            CONNECTOR_PRESETS.map(
              (preset) =>
                `${installed.includes(preset.id) ? '[installed]' : '[available]'} ${preset.id} - ${preset.description}`,
            ).join('\n'),
          )
          return
        }
        const presetName = argsText.split(/\s+/)[0] ?? ''
        const extraArgs = argsText.split(/\s+/).slice(1).filter((arg) => arg.length > 0)
        if (extraArgs[0] === 'cancel') {
          wizardRef.current = null
          appendSystem('Wizard cancelled.')
          return
        }
        const preset = getPreset(presetName)
        if (preset === undefined) {
          appendSystem(`connect failed: unknown connector preset '${presetName}'`)
          return
        }
        // Wizard path (Phase 122): needed when env secrets are missing from
        // the host or the preset expects arguments; otherwise 121's direct path.
        const needsWizard =
          (preset.requiredEnv ?? []).some((key) => {
            const value = process.env[key]
            return value === undefined || value.length === 0
          }) || (preset.expectsArgs ?? []).length > 0
        if (needsWizard) {
          const wizard = new ConnectorWizard(presetName)
          wizardRef.current = wizard
          appendSystem(wizard.currentPrompt() ?? '')
          appendSystem('Answer with /answer <value> - /answer cancel aborts.')
          return
        }
        const installed = installPreset(presetName, mcpPresetsRef.current, extraArgs)
        if (!installed.ok) {
          appendSystem(`connect failed: ${installed.error ?? 'unknown error'}`)
          return
        }
        const warnings = installed.warnings ?? []
        appendSystem(
          [
            `MCP server '${presetName}' configured (${installed.spec?.command ?? ''} ${(
              installed.spec?.args ?? []
            ).join(' ')}).`,
            ...warnings,
          ].join('\n'),
        )
        return
      }
      if (command === 'plugin') {
        if (argsText === '' || argsText === 'installed') {
          const installed = pluginRegistryRef.current.installed()
          appendSystem(
            installed.length === 0
              ? 'No plugins installed.'
              : installed
                  .map((p: InstalledPlugin) => `[installed] ${p.name} v${p.version} — ${p.dir}`)
                  .join('\n'),
          )
          return
        }
        const addMatch = /^marketplace\s+add\s+(\S+\/\S+)\s*$/.exec(argsText)
        if (addMatch !== null) {
          marketplaceSourceRef.current = addMatch[1]
          appendSystem(
            `Marketplace source set to ${addMatch[1]}. Browse with /plugin marketplace browse.`,
          )
          return
        }
        const browseMatch = /^marketplace\s+browse\s*$/.exec(argsText)
        if (browseMatch !== null) {
          const source = marketplaceSourceRef.current
          if (source === null) {
            appendSystem('No marketplace source. Use /plugin marketplace add owner/repo.')
            return
          }
          const client = new MarketplaceClient({ source })
          const result = await client.browse()
          appendSystem(
            result.ok
              ? (result.entries ?? [])
                  .map((e) => `${e.name} v${e.version} — ${e.description ?? ''}`)
                  .join('\n') || 'Marketplace is empty.'
              : `Marketplace browse failed: ${result.error}`,
          )
          return
        }
        appendSystem(`Unknown plugin subcommand: ${argsText}`)
        return
      }
      appendSystem(`Unknown command: ${value}`)
      return
    }

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
      {state.showContextGrid && (
        <ContextGrid snapshot={() => budgeterRef.current.calculateBudget()} width={32} />
      )}
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
