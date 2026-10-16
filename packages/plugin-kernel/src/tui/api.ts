/**
 * TUI plugin API (Phase 112): a registry that loaded plugins use to
 * contribute commands, keybindings, routes, and dialogs to the TUI.
 *
 * The kernel never imports the TUI layer: `api.ts` is a pure store plus
 * lookup/projection helpers. The TUI app feeds contributions in at plugin
 * load time, dispatches keybindings via `matchKeybinding`, and renders its
 * command palette from `commandsForPalette()`. All ids are namespaced by
 * the contributing plugin (`<plugin>:<id>`) so independently developed
 * plugins cannot collide.
 */

export interface TuiCommandContext {
  /** Surface a message in the active chat session. */
  sendMessage(content: string): void
}

export interface TuiCommand {
  /** Namespaced id (`<plugin>:<id>`). */
  id: string
  title: string
  description?: string
  handler?: (context: TuiCommandContext) => void
}

export interface TuiKeybinding {
  /** Key combo as produced by the TUI keyboard manager (e.g. `ctrl+d`). */
  combo: string
  description?: string
  handler: () => void
}

export interface TuiRoute {
  id: string
  title: string
  /** Lazy so plugins can compute content at render time. */
  content: () => string
}

export interface TuiDialog {
  id: string
  title: string
  message: () => string
}

/** Command-palette entry shape the TUI palette renders. */
export interface TuiPaletteEntry {
  id: string
  title: string
  description: string
  group: 'plugin'
}

export interface RegisterResult {
  ok: boolean
  id?: string
  error?: string
}

interface StoredCommand extends TuiCommand {
  plugin: string
}

interface StoredKeybinding extends TuiKeybinding {
  plugin: string
}

interface StoredRoute extends TuiRoute {
  plugin: string
}

interface StoredDialog extends TuiDialog {
  plugin: string
}

export class TuiPluginApi {
  private readonly commandsByName = new Map<string, StoredCommand>()
  private readonly keybindingsByCombo = new Map<string, StoredKeybinding>()
  private readonly routesById = new Map<string, StoredRoute>()
  private readonly dialogsById = new Map<string, StoredDialog>()

  private namespaced(plugin: string, id: string): string {
    return `${plugin}:${id}`
  }

  registerCommand(
    plugin: string,
    command: Omit<TuiCommand, 'id'> & { id: string },
  ): RegisterResult {
    const id = this.namespaced(plugin, command.id)
    if (this.commandsByName.has(id)) {
      return { ok: false, error: `command '${id}' is already registered` }
    }
    this.commandsByName.set(id, { ...command, id, plugin })
    return { ok: true, id }
  }

  registerKeybinding(
    plugin: string,
    keybinding: Omit<TuiKeybinding, 'id'> & { combo: string },
  ): RegisterResult {
    const combo = keybinding.combo
    if (this.keybindingsByCombo.has(combo)) {
      return { ok: false, error: `keybinding '${combo}' is already registered` }
    }
    this.keybindingsByCombo.set(combo, { ...keybinding, combo, plugin })
    return { ok: true, id: combo }
  }

  registerRoute(plugin: string, route: Omit<TuiRoute, 'id'> & { id: string }): RegisterResult {
    const id = this.namespaced(plugin, route.id)
    if (this.routesById.has(id)) {
      return { ok: false, error: `route '${id}' is already registered` }
    }
    this.routesById.set(id, { ...route, id, plugin })
    return { ok: true, id }
  }

  registerDialog(plugin: string, dialog: Omit<TuiDialog, 'id'> & { id: string }): RegisterResult {
    const id = this.namespaced(plugin, dialog.id)
    if (this.dialogsById.has(id)) {
      return { ok: false, error: `dialog '${id}' is already registered` }
    }
    this.dialogsById.set(id, { ...dialog, id, plugin })
    return { ok: true, id }
  }

  commands(): TuiCommand[] {
    return [...this.commandsByName.values()].map(({ plugin: _plugin, ...rest }) => rest)
  }

  keybindings(): TuiKeybinding[] {
    return [...this.keybindingsByCombo.values()].map(({ plugin: _plugin, ...rest }) => rest)
  }

  routes(): TuiRoute[] {
    return [...this.routesById.values()].map(({ plugin: _plugin, ...rest }) => rest)
  }

  dialogs(): TuiDialog[] {
    return [...this.dialogsById.values()].map(({ plugin: _plugin, ...rest }) => rest)
  }

  /** Project commands into the TUI command-palette entry shape. */
  commandsForPalette(): TuiPaletteEntry[] {
    return this.commands().map((command) => ({
      id: command.id,
      title: command.title,
      description: command.description ?? command.title,
      group: 'plugin' as const,
    }))
  }

  /** Resolve the handler bound to a key combo, if any plugin claimed it. */
  matchKeybinding(combo: string): (() => void) | undefined {
    return this.keybindingsByCombo.get(combo)?.handler
  }

  /** Remove every contribution from one plugin (used on plugin unload). */
  unregisterPlugin(plugin: string): boolean {
    let removed = false
    for (const [id, command] of this.commandsByName) {
      if (command.plugin === plugin) {
        this.commandsByName.delete(id)
        removed = true
      }
    }
    for (const [combo, keybinding] of this.keybindingsByCombo) {
      if (keybinding.plugin === plugin) {
        this.keybindingsByCombo.delete(combo)
        removed = true
      }
    }
    for (const [id, route] of this.routesById) {
      if (route.plugin === plugin) {
        this.routesById.delete(id)
        removed = true
      }
    }
    for (const [id, dialog] of this.dialogsById) {
      if (dialog.plugin === plugin) {
        this.dialogsById.delete(id)
        removed = true
      }
    }
    return removed
  }
}
