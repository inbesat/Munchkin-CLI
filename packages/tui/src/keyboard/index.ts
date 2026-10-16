import { useInput } from 'ink'
import { useEffect, useRef } from 'react'

/** Key combination representation. */
export interface KeyCombo {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

/** Key binding definition. */
export interface KeyBinding {
  /** The key combination (e.g., 'Space', 'Ctrl+P', 'Leader f') */
  combo: string
  /** Human-readable description */
  description: string
  /** Handler function */
  handler: () => void | Promise<void>
  /** Whether this binding is global (works in any context) */
  global?: boolean
  /** Context where this binding applies */
  context?: string
}

/** Leader key state. */
interface LeaderState {
  active: boolean
  timeoutId: NodeJS.Timeout | null
}

/** Keyboard manager for handling key bindings. */
export class KeyboardManager {
  private bindings: Map<string, KeyBinding[]> = new Map()
  private leaderState: LeaderState = { active: false, timeoutId: null }
  private leaderKey = 'Space'
  private leaderTimeout = 1000
  private context = 'global'
  private helpVisible = false

  constructor(options: { leaderKey?: string; leaderTimeout?: number } = {}) {
    this.leaderKey = options.leaderKey ?? 'Space'
    this.leaderTimeout = options.leaderTimeout ?? 1000
  }

  /** Set the current context. */
  setContext(context: string): void {
    this.context = context
  }

  /** Get current context. */
  getContext(): string {
    return this.context
  }

  /** Register a key binding. */
  register(binding: KeyBinding): void {
    const key = binding.combo.toLowerCase()
    const existing = this.bindings.get(key) ?? []
    existing.push(binding)
    this.bindings.set(key, existing)
  }

  /** Unregister a key binding. */
  unregister(combo: string): void {
    const key = combo.toLowerCase()
    this.bindings.delete(key)
  }

  /** Register multiple bindings at once. */
  registerAll(bindings: KeyBinding[]): void {
    for (const binding of bindings) {
      this.register(binding)
    }
  }

  /** Handle a key press. */
  async handleKey(
    key: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
  ): Promise<boolean> {
    const combo = this.formatCombo(key, modifiers)

    // Check for leader key activation
    if (key === this.leaderKey && !modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
      this.activateLeader()
      return true
    }

    // Handle leader key sequences
    if (this.leaderState.active) {
      const leaderCombo = `leader ${key}`.toLowerCase()
      const bindings = this.bindings.get(leaderCombo) ?? []
      for (const binding of bindings) {
        if (this.matchesContext(binding)) {
          this.deactivateLeader()
          await binding.handler()
          return true
        }
      }
      // No matching leader binding
      this.deactivateLeader()
      return true
    }

    // Check regular bindings
    const bindings = this.bindings.get(combo) ?? []
    for (const binding of bindings) {
      if (this.matchesContext(binding)) {
        await binding.handler()
        return true
      }
    }

    return false
  }

  /** Activate leader key mode. */
  private activateLeader(): void {
    this.leaderState.active = true
    if (this.leaderState.timeoutId) {
      clearTimeout(this.leaderState.timeoutId)
    }
    this.leaderState.timeoutId = setTimeout(() => {
      this.deactivateLeader()
    }, this.leaderTimeout)
  }

  /** Deactivate leader key mode. */
  private deactivateLeader(): void {
    this.leaderState.active = false
    if (this.leaderState.timeoutId) {
      clearTimeout(this.leaderState.timeoutId)
      this.leaderState.timeoutId = null
    }
  }

  /** Check if leader is active. */
  isLeaderActive(): boolean {
    return this.leaderState.active
  }

  /** Format a key combo string. */
  private formatCombo(
    key: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
  ): string {
    const parts: string[] = []
    if (modifiers.ctrl) parts.push('ctrl')
    if (modifiers.shift) parts.push('shift')
    if (modifiers.alt) parts.push('alt')
    if (modifiers.meta) parts.push('meta')
    parts.push(key.toLowerCase())
    return parts.join('+')
  }

  /** Check if binding matches current context. */
  private matchesContext(binding: KeyBinding): boolean {
    if (!binding.context || binding.context === 'global') return true
    return binding.context === this.context
  }

  /** Get all bindings for help display. */
  getBindings(context?: string): KeyBinding[] {
    const targetContext = context ?? this.context
    const result: KeyBinding[] = []

    for (const [, bindings] of this.bindings) {
      for (const binding of bindings) {
        if (!binding.context || binding.context === 'global' || binding.context === targetContext) {
          result.push(binding)
        }
      }
    }

    return result
  }

  /** Show/hide help. */
  setHelpVisible(visible: boolean): void {
    this.helpVisible = visible
  }

  /** Toggle help visibility. */
  toggleHelp(): void {
    this.helpVisible = !this.helpVisible
  }

  /** Check if help is visible. */
  isHelpVisible(): boolean {
    return this.helpVisible
  }
}

/** Global keyboard manager instance. */
let globalKeyboardManager: KeyboardManager | null = null

/** Get or create global keyboard manager. */
export function getKeyboardManager(options?: {
  leaderKey?: string
  leaderTimeout?: number
}): KeyboardManager {
  if (!globalKeyboardManager) {
    globalKeyboardManager = new KeyboardManager(options)
  }
  return globalKeyboardManager
}

/** Set global keyboard manager. */
export function setKeyboardManager(manager: KeyboardManager): void {
  globalKeyboardManager = manager
}

/** Clear global keyboard manager. */
export function clearKeyboardManager(): void {
  globalKeyboardManager = null
}

/** Hook for using keyboard manager in components. */
export function useKeyboardManager(): KeyboardManager {
  const managerRef = useRef<KeyboardManager | null>(null)

  if (!managerRef.current) {
    managerRef.current = getKeyboardManager()
  }

  return managerRef.current
}

/** Hook for registering key bindings in a component. */
export function useKeyBindings(bindings: KeyBinding[], context?: string): void {
  const manager = useKeyboardManager()
  const prevBindingsRef = useRef<KeyBinding[]>([])

  useEffect(() => {
    // Unregister previous bindings
    for (const binding of prevBindingsRef.current) {
      manager.unregister(binding.combo)
    }

    // Register new bindings with context
    const contextualBindings = bindings.map((b) => ({
      ...b,
      context: b.context ?? context ?? 'global',
    }))

    manager.registerAll(contextualBindings)
    prevBindingsRef.current = contextualBindings

    return () => {
      for (const binding of contextualBindings) {
        manager.unregister(binding.combo)
      }
    }
  }, [bindings, context, manager])
}

/** Hook for handling raw input. */
export function useInputHandler(
  handler: (
    key: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
  ) => Promise<boolean>,
  enabled = true,
): void {
  const manager = useKeyboardManager()

  useInput(async (key, modifiers) => {
    if (!enabled) return
    // Let manager handle leader key and bindings first
    const handled = await manager.handleKey(key, modifiers)
    if (handled) return

    // Then call custom handler
    handler(key, modifiers)
  })
}

/** Default key bindings for the app. */
export function createDefaultBindings(actions: {
  toggleSidebar?: () => void
  toggleTheme?: () => void
  newChat?: () => void
  openSettings?: () => void
  openHelp?: () => void
  toggleHelp?: () => void
  quit?: () => void
  focusInput?: () => void
  focusChat?: () => void
  focusSidebar?: () => void
  nextTab?: () => void
  prevTab?: () => void
  closeTab?: () => void
  copyCode?: () => void
  interrupt?: () => void
  retry?: () => void
}): KeyBinding[] {
  const bindings: KeyBinding[] = []

  // Global bindings
  if (actions.quit) {
    bindings.push({
      combo: 'ctrl+c',
      description: 'Quit application',
      handler: actions.quit,
      global: true,
    })
  }

  if (actions.toggleHelp) {
    bindings.push({
      combo: 'f1',
      description: 'Show help',
      handler: actions.toggleHelp,
      global: true,
    })
  }

  // Leader key bindings
  if (actions.toggleSidebar) {
    bindings.push({
      combo: 'leader b',
      description: 'Toggle sidebar',
      handler: actions.toggleSidebar,
    })
  }

  if (actions.toggleTheme) {
    bindings.push({
      combo: 'leader t',
      description: 'Toggle theme',
      handler: actions.toggleTheme,
    })
  }

  if (actions.newChat) {
    bindings.push({
      combo: 'leader n',
      description: 'New chat',
      handler: actions.newChat,
    })
  }

  if (actions.openSettings) {
    bindings.push({
      combo: 'leader s',
      description: 'Open settings',
      handler: actions.openSettings,
    })
  }

  if (actions.openHelp) {
    bindings.push({
      combo: 'leader h',
      description: 'Open help',
      handler: actions.openHelp,
    })
  }

  if (actions.focusInput) {
    bindings.push({
      combo: 'leader i',
      description: 'Focus input',
      handler: actions.focusInput,
    })
  }

  if (actions.focusChat) {
    bindings.push({
      combo: 'leader c',
      description: 'Focus chat',
      handler: actions.focusChat,
    })
  }

  if (actions.focusSidebar) {
    bindings.push({
      combo: 'leader f',
      description: 'Focus sidebar',
      handler: actions.focusSidebar,
    })
  }

  if (actions.nextTab) {
    bindings.push({
      combo: 'ctrl+tab',
      description: 'Next tab',
      handler: actions.nextTab,
      global: true,
    })
    bindings.push({
      combo: 'leader ]',
      description: 'Next tab',
      handler: actions.nextTab,
    })
  }

  if (actions.prevTab) {
    bindings.push({
      combo: 'ctrl+shift+tab',
      description: 'Previous tab',
      handler: actions.prevTab,
      global: true,
    })
    bindings.push({
      combo: 'leader [',
      description: 'Previous tab',
      handler: actions.prevTab,
    })
  }

  if (actions.closeTab) {
    bindings.push({
      combo: 'ctrl+w',
      description: 'Close tab',
      handler: actions.closeTab,
      global: true,
    })
    bindings.push({
      combo: 'leader x',
      description: 'Close tab',
      handler: actions.closeTab,
    })
  }

  if (actions.copyCode) {
    bindings.push({
      combo: 'leader y',
      description: 'Copy code block',
      handler: actions.copyCode,
    })
  }

  if (actions.interrupt) {
    bindings.push({
      combo: 'ctrl+c',
      description: 'Interrupt current operation',
      handler: actions.interrupt,
      global: true,
    })
  }

  if (actions.retry) {
    bindings.push({
      combo: 'leader r',
      description: 'Retry last operation',
      handler: actions.retry,
    })
  }

  return bindings
}

/** Format key for display. */
export function formatKey(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      const upper = part.toUpperCase()
      if (upper === 'CTRL') return '⌃'
      if (upper === 'SHIFT') return '⇧'
      if (upper === 'ALT') return '⌥'
      if (upper === 'META') return '⌘'
      if (upper === 'LEADER') return '␣'
      return upper
    })
    .join('')
}

/** Get key display for help. */
export function getKeyDisplay(binding: KeyBinding): string {
  return formatKey(binding.combo)
}
export { parseKittyKey, KITTY_ENABLE, KITTY_DISABLE, type KittyKey } from './kitty'
export {
  parseMouseSGR,
  MOUSE_ENABLE,
  MOUSE_DISABLE,
  type MouseEvent,
  type MouseButton,
  type MouseAction,
} from './mouse'
