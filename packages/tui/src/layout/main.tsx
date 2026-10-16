import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatKey as formatKeyImport, getKeyboardManager } from '../keyboard'
import { type ThemeMode, useThemeColors } from '../theme'

/** Message type for chat. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
}

/** Sidebar item type. */
export interface SidebarItem {
  id: string
  label: string
  icon?: string
  badge?: string
  onClick?: () => void
}

/** Layout props. */
export interface MainLayoutProps {
  messages: ChatMessage[]
  sidebarItems?: SidebarItem[]
  inputValue: string
  inputPlaceholder?: string
  inputFocused?: boolean
  onInputChange?: (value: string) => void
  onInputSubmit?: (value: string) => void
  sidebarWidth?: number
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  themeMode?: ThemeMode
  onToggleTheme?: () => void
  statusLeft?: React.ReactNode
  statusRight?: React.ReactNode
  loading?: boolean
  error?: string
  renderMessage?: (message: ChatMessage) => React.ReactNode
  renderSidebarItem?: (item: SidebarItem, index: number, isSelected: boolean) => React.ReactNode
}

/** Main layout component. */
export function MainLayout({
  messages = [],
  sidebarItems = [],
  inputValue = '',
  inputPlaceholder = 'Type a message...',
  inputFocused = false,
  onInputChange,
  onInputSubmit,
  sidebarWidth = 30,
  sidebarOpen = true,
  onToggleSidebar,
  themeMode = 'dark',
  onToggleTheme,
  statusLeft,
  statusRight,
  loading = false,
  error,
  renderMessage,
  renderSidebarItem,
}: MainLayoutProps) {
  const colors = useThemeColors()
  const [focusedArea, setFocusedArea] = useState<'sidebar' | 'chat' | 'input'>('input')
  const [selectedSidebarIndex, setSelectedSidebarIndex] = useState(0)
  const [terminalSize, setTerminalSize] = useState({ width: 80, height: 24 })
  const [showHelp, setShowHelp] = useState(false)
  const chatEndRef = useRef<any>(null)
  const sidebarRef = useRef<any>(null)
  const chatRef = useRef<any>(null)
  const inputRef = useRef<any>(null)

  const keyboardManager = getKeyboardManager()

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({
        width: process.stdout.columns ?? 80,
        height: process.stdout.rows ?? 24,
      })
    }
    handleResize()
    process.stdout.on('resize', handleResize)
    return () => {
      process.stdout.off('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView?.()
    }
  }, [messages.length])

  const focusSidebar = useCallback(() => setFocusedArea('sidebar'), [])
  const focusChat = useCallback(() => setFocusedArea('chat'), [])
  const focusInput = useCallback(() => setFocusedArea('input'), [])

  const sidebarW = sidebarOpen ? sidebarWidth : 0
  const chatWidth = terminalSize.width - sidebarW - 2
  const chatHeight = terminalSize.height - 4

  const getFocusBorder = (area: 'sidebar' | 'chat' | 'input') => {
    if (focusedArea !== area) return undefined
    return colors.borderFocus
  }

  const handleSidebarNavigation = useCallback(
    (key: string) => {
      if (!sidebarOpen || sidebarItems.length === 0) return false
      if (key === 'up') {
        setSelectedSidebarIndex((prev) => (prev > 0 ? prev - 1 : sidebarItems.length - 1))
        return true
      }
      if (key === 'down') {
        setSelectedSidebarIndex((prev) => (prev < sidebarItems.length - 1 ? prev + 1 : 0))
        return true
      }
      if (key === 'enter') {
        const item = sidebarItems[selectedSidebarIndex]
        item.onClick?.()
        return true
      }
      return false
    },
    [sidebarOpen, sidebarItems, selectedSidebarIndex],
  )

  const handleChatNavigation = useCallback((key: string) => {
    if (key === 'pageup' || key === 'pagedown' || key === 'home' || key === 'end') return true
    return false
  }, [])

  const handleInputKey = useCallback(
    (
      key: string,
      modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
    ) => {
      if (key === 'enter' && !modifiers.shift && !modifiers.ctrl) {
        if (inputValue.trim() && onInputSubmit) {
          onInputSubmit(inputValue)
          return true
        }
      }
      if (key === 'enter' && modifiers.shift) {
        if (onInputChange) onInputChange(inputValue + '\n')
        return true
      }
      if (key === 'escape') {
        if (inputValue) {
          onInputChange?.('')
        } else {
          focusChat()
        }
        return true
      }
      return false
    },
    [inputValue, onInputSubmit, onInputChange, focusChat],
  )

  const combinedKeyHandler = useCallback(
    async (key: string, modifiers: any) => {
      if (focusedArea === 'sidebar' && handleSidebarNavigation(key)) return true
      if (focusedArea === 'chat' && handleChatNavigation(key)) return true
      if (focusedArea === 'input' && handleInputKey(key, modifiers)) return true
      if (key === 'f1') {
        setShowHelp((prev) => !prev)
        return true
      }
      if (key === 'escape') {
        if (showHelp) {
          setShowHelp(false)
        } else if (inputValue) {
          onInputChange?.('')
        } else {
          focusChat()
        }
        return true
      }
      return false
    },
    [
      focusedArea,
      handleSidebarNavigation,
      handleChatNavigation,
      handleInputKey,
      showHelp,
      inputValue,
      onInputChange,
      focusChat,
    ],
  )

  useInput(combinedKeyHandler)

  return (
    <Box flexDirection="column" height="100%" width="100%">
      <Box
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        borderBottom
        borderBottomColor={colors.border}
        alignItems="center"
      >
        <Text color={colors.primary} bold>
          forge
        </Text>
        <Box marginLeft={1}>
          <Text color={colors.textMuted}>v0.1.0</Text>
        </Box>
        {statusLeft && (
          <Box flexDirection="row" marginLeft={2}>
            {statusLeft}
          </Box>
        )}
        <Box flexGrow={1} />
        {statusRight && (
          <Box flexDirection="row" marginRight={1}>
            {statusRight}
          </Box>
        )}
        <Box marginRight={2}>
          <Text color={colors.textMuted}>{themeMode.toUpperCase()}</Text>
        </Box>
        <Box marginRight={2}>
          <Text color={colors.textMuted}>
            {terminalSize.width}x{terminalSize.height}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="row" flexGrow={1} height={chatHeight + 2}>
        {sidebarOpen && (
          <Box
            ref={sidebarRef}
            width={sidebarW}
            height={chatHeight}
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={1}
            paddingRight={1}
            borderRight={sidebarOpen}
            borderRightColor={colors.border}
            overflowY="hidden"
            borderColor={getFocusBorder('sidebar')}
          >
            <Box marginBottom={1}>
              <Text color={colors.primary} bold>
                SESSIONS
              </Text>
            </Box>
            {sidebarItems.map((item, index) => {
              const isSelected = index === selectedSidebarIndex && focusedArea === 'sidebar'
              if (renderSidebarItem) {
                return renderSidebarItem(item, index, isSelected)
              }
              return (
                <Box
                  key={item.id}
                  paddingLeft={1}
                  paddingRight={1}
                  paddingTop={0}
                  paddingBottom={0}
                  marginTop={0}
                  marginBottom={0}
                >
                  <Box flexDirection="row" alignItems="center">
                    {item.icon && (
                      <Box marginRight={1}>
                        <Text>{item.icon}</Text>
                      </Box>
                    )}
                    <Box flexGrow={1}>
                      <Text>{item.label}</Text>
                    </Box>
                    {item.badge && (
                      <Box paddingLeft={1} paddingRight={1} paddingTop={0} paddingBottom={0}>
                        <Text color={colors.accent} backgroundColor={colors.surfaceElevated}>
                          {item.badge}
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              )
            })}
            {sidebarItems.length === 0 && (
              <Box marginTop={2}>
                <Text color={colors.textMuted}>No sessions</Text>
              </Box>
            )}
          </Box>
        )}

        <Box
          ref={chatRef}
          flexGrow={1}
          width={chatWidth}
          height={chatHeight}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
          overflowY="hidden"
          borderColor={getFocusBorder('chat')}
        >
          {messages.map((message) => {
            if (renderMessage) {
              return <Box key={message.id}>{renderMessage(message)}</Box>
            }
            const isUser = message.role === 'user'
            const isTool = message.role === 'tool'
            const isSystem = message.role === 'system'

            return (
              <Box key={message.id} marginBottom={1} paddingLeft={1}>
                <Box flexDirection="row" marginBottom={0}>
                  <Text
                    color={
                      isUser
                        ? colors.primary
                        : isTool
                          ? colors.accent
                          : isSystem
                            ? colors.warning
                            : colors.success
                    }
                    bold
                  >
                    {isUser ? 'â–º' : isTool ? 'âš™' : isSystem ? 'â—†' : 'â—'}
                  </Text>
                  <Box marginLeft={1}>
                    <Text color={colors.textSecondary}>{message.role.toUpperCase()}</Text>
                  </Box>
                  <Box marginLeft={1}>
                    <Text color={colors.textMuted}>{message.timestamp.toLocaleTimeString()}</Text>
                  </Box>
                  {message.toolName && (
                    <Box marginLeft={1}>
                      <Text color={colors.accent}>[{message.toolName}]</Text>
                    </Box>
                  )}
                </Box>
                <Box marginLeft={2}>
                  <Text color={isUser ? colors.textPrimary : colors.textSecondary}>
                    {message.content}
                  </Text>
                </Box>
              </Box>
            )
          })}
          {messages.length === 0 && (
            <Box height="100%" flexDirection="column" alignItems="center" justifyContent="center">
              <Box marginBottom={1}>
                <Text color={colors.textMuted}>Welcome to forge</Text>
              </Box>
              <Box>
                <Text color={colors.textMuted}>
                  Press <Text color={colors.primary}>Space</Text> for commands
                </Text>
              </Box>
              <Box marginTop={1}>
                <Text color={colors.textMuted}>
                  Press <Text color={colors.primary}>F1</Text> for help
                </Text>
              </Box>
            </Box>
          )}
          <Box ref={chatEndRef} />
        </Box>
      </Box>

      <Box
        ref={inputRef}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        borderTop
        borderTopColor={colors.border}
        alignItems="center"
        borderColor={getFocusBorder('input')}
      >
        <Box marginRight={1}>
          <Text color={focusedArea === 'input' ? colors.primary : colors.textSecondary}>â€º</Text>
        </Box>
        <Box flexGrow={1} flexDirection="row" alignItems="center">
          <Box
            flexGrow={1}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={0}
            paddingBottom={0}
          >
            <Text
              backgroundColor={
                focusedArea === 'input' ? colors.surfaceElevated : 'transparent'
              }
              color={colors.textPrimary}
            >
              {inputValue || <Text color={colors.textMuted}>{inputPlaceholder}</Text>}
            </Text>
          </Box>
          {loading && (
            <Box marginLeft={1} flexDirection="row">
              <Text color={colors.primary}>âŸ³</Text>
              <Box marginLeft={1}>
                <Text color={colors.textMuted}>Processing...</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
        borderTop
        borderTopColor={colors.border}
      >
        <Box flexDirection="row">
          <Text color={loading ? colors.warning : colors.success}>{loading ? 'â—' : 'â—'}</Text>
          <Box marginLeft={1}>
            <Text color={colors.textSecondary}>{loading ? 'Processing...' : 'Ready'}</Text>
          </Box>
          {error && (
            <>
              <Box marginLeft={2}>
                <Text color={colors.error}>Error: {error}</Text>
              </Box>
            </>
          )}
        </Box>
        <Box flexDirection="row">
          <Text color={colors.textMuted}>{focusedArea.toUpperCase()}</Text>
          <Box marginLeft={2}>
            <Text color={colors.textMuted}>
              {keyboardManager.isLeaderActive() && 'LEADER ACTIVE'}
            </Text>
          </Box>
        </Box>
      </Box>

      {showHelp && (
        <Box
          // @ts-ignore - position works at runtime
          position="absolute"
          // @ts-ignore - top works at runtime
          top={0}
          // @ts-ignore - left works at runtime
          left={0}
          width="100%"
          height="100%"
          padding={2}
          overflowY="hidden"
        >
          <Box
            // @ts-ignore - backgroundColor works at runtime
            backgroundColor={colors.surfaceElevated}
            padding={2}
            // @ts-ignore - borderRadius works at runtime
            borderRadius={2}
            marginBottom={1}
          >
            <Box marginBottom={1}>
              <Text bold color={colors.primary}>
                KEYBOARD SHORTCUTS
              </Text>
            </Box>
            <Box marginBottom={1}>
              <Text color={colors.textMuted}>Leader key: SPACE (hold to see leader bindings)</Text>
            </Box>
          </Box>
          <Box flexDirection="column">
            {getKeyboardManager()
              .getBindings()
              .map((binding: any, i: number) => (
                <Box
                  key={i}
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  paddingTop={0}
                  paddingBottom={0}
                >
                  <Box width={12}>
                    <Text color={colors.primary}>{formatKeyImport(binding.combo)}</Text>
                  </Box>
                  <Text color={colors.textSecondary}>{binding.description}</Text>
                </Box>
              ))}
          </Box>
          <Box marginTop={2} flexDirection="row">
            <Text color={colors.textMuted}>Press </Text>
            <Text color={colors.primary}>F1</Text>
            <Text color={colors.textMuted}> or </Text>
            <Text color={colors.primary}>ESC</Text>
            <Text color={colors.textMuted}> to close</Text>
          </Box>
        </Box>
      )}

      {error && !showHelp && (
        <Box
          // @ts-ignore - position works at runtime
          position="absolute"
          // @ts-ignore - bottom works at runtime
          bottom={3}
          // @ts-ignore - left works at runtime
          left={2}
          // @ts-ignore - right works at runtime
          right={2}
          padding={1}
          // @ts-ignore - borderRadius works at runtime
          borderRadius={2}
          // @ts-ignore - zIndex works at runtime
          zIndex={50}
          // @ts-ignore - backgroundColor works at runtime
          backgroundColor={colors.error}
        >
          <Text color={colors.textInverse}>Error: {error}</Text>
        </Box>
      )}
    </Box>
  )
}
