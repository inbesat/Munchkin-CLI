import { describe, expect, it } from 'bun:test'
import { TuiPluginApi } from './api'

describe('TUI plugin API (Phase 112)', () => {
  it('registers a custom command that appears in the command palette', () => {
    const api = new TuiPluginApi()
    const registered = api.registerCommand('deploy-tools', {
      id: 'rollback',
      title: 'rollback',
      description: 'Roll back the last deployment',
    })
    expect(registered.ok).toBe(true)
    expect(registered.id).toBe('deploy-tools:rollback')

    const palette = api.commandsForPalette()
    const entry = palette.find((c) => c.id === 'deploy-tools:rollback')
    expect(entry).toBeDefined()
    expect(entry?.title).toBe('rollback')
    expect(entry?.description).toBe('Roll back the last deployment')
    expect(entry?.group).toBe('plugin')
  })

  it('runs a registered command handler with the provided context', () => {
    const api = new TuiPluginApi()
    const sent: string[] = []
    api.registerCommand('notes', {
      id: 'add',
      title: 'add note',
      handler: (context) => context.sendMessage('note added'),
    })
    const command = api.commands().find((c) => c.id === 'notes:add')
    expect(command).toBeDefined()
    command?.handler({ sendMessage: (m) => sent.push(m) })
    expect(sent).toEqual(['note added'])
  })

  it('registers a keybinding that works via matchKeybinding', () => {
    const api = new TuiPluginApi()
    let fired = 0
    const registered = api.registerKeybinding('deploy-tools', {
      combo: 'ctrl+d',
      description: 'Open deploy dialog',
      handler: () => {
        fired += 1
      },
    })
    expect(registered.ok).toBe(true)

    const handler = api.matchKeybinding('ctrl+d')
    expect(handler).toBeDefined()
    handler?.()
    handler?.()
    expect(fired).toBe(2)
    expect(api.matchKeybinding('ctrl+shift+d')).toBeUndefined()
  })

  it('stores routes and dialogs as data with lazy content', () => {
    const api = new TuiPluginApi()
    expect(
      api.registerRoute('docs', { id: 'quickstart', title: 'Quickstart', content: () => 'step 1' })
        .ok,
    ).toBe(true)
    expect(
      api.registerDialog('docs', {
        id: 'migrate',
        title: 'Migrate?',
        message: () => 'Run 3 migrations?',
      }).ok,
    ).toBe(true)

    const route = api.routes().find((r) => r.id === 'docs:quickstart')
    const dialog = api.dialogs().find((d) => d.id === 'docs:migrate')
    expect(route?.title).toBe('Quickstart')
    expect(route?.content()).toBe('step 1')
    expect(dialog?.title).toBe('Migrate?')
    expect(dialog?.message()).toBe('Run 3 migrations?')
  })

  it('rejects duplicate registrations across plugins and re-registrations', () => {
    const api = new TuiPluginApi()
    expect(api.registerCommand('a', { id: 'one', title: 'one' }).ok).toBe(true)
    expect(api.registerCommand('b', { id: 'one-x', title: 'other' }).ok).toBe(true)
    const duplicate = api.registerCommand('a', { id: 'one', title: 'again' })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toContain('a:one')

    expect(api.registerKeybinding('a', { combo: 'ctrl+q', handler: () => {} }).ok).toBe(true)
    expect(api.registerKeybinding('b', { combo: 'ctrl+q', handler: () => {} }).ok).toBe(false)

    expect(api.registerRoute('a', { id: 'r', title: 'R', content: () => '' }).ok).toBe(true)
    // Namespacing keeps cross-plugin raw ids distinct: 'b:r' != 'a:r'.
    expect(api.registerRoute('b', { id: 'r', title: 'R', content: () => '' }).ok).toBe(true)
    // Re-registration by the same plugin is the real collision case.
    expect(api.registerRoute('a', { id: 'r', title: 'again', content: () => '' }).ok).toBe(false)
    expect(api.registerDialog('a', { id: 'd', title: 'D', message: () => '' }).ok).toBe(true)
    expect(api.registerDialog('b', { id: 'd', title: 'D', message: () => '' }).ok).toBe(true)
    expect(api.registerDialog('a', { id: 'd', title: 'again', message: () => '' }).ok).toBe(false)
  })

  it('unregisterPlugin reaps every contribution from that plugin only', () => {
    const api = new TuiPluginApi()
    api.registerCommand('a', { id: 'one', title: 'one' })
    api.registerKeybinding('a', { combo: 'ctrl+a', handler: () => {} })
    api.registerRoute('a', { id: 'r', title: 'R', content: () => 'a' })
    api.registerDialog('a', { id: 'd', title: 'D', message: () => 'a' })
    api.registerCommand('b', { id: 'two', title: 'two' })
    api.registerKeybinding('b', { combo: 'ctrl+b', handler: () => {} })

    expect(api.unregisterPlugin('a')).toBe(true)
    expect(api.unregisterPlugin('a')).toBe(false)

    expect(api.commands().map((c) => c.id)).toEqual(['b:two'])
    expect(api.matchKeybinding('ctrl+a')).toBeUndefined()
    expect(api.matchKeybinding('ctrl+b')).toBeDefined()
    expect(api.routes()).toEqual([])
    expect(api.dialogs()).toEqual([])
  })
})
