import { describe, expect, it } from 'bun:test'
import {
  filterCommands,
  moveSelection,
  defaultCommands,
  type Command,
} from './command-palette'

const cmds: Command[] = [
  { id: 'help', title: 'help', description: 'Show help', group: 'builtin' },
  { id: 'clear', title: 'clear', description: 'Clear screen', group: 'builtin' },
  { id: 'model', title: 'model', description: 'Switch model', group: 'builtin' },
  { id: 'theme', title: 'theme', description: 'Change theme', group: 'builtin' },
  { id: 'permissions', title: 'permissions', description: 'Perms', group: 'builtin' },
]

describe('filterCommands', () => {
  it('returns all commands for empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(5)
    expect(filterCommands(cmds, '   ')).toHaveLength(5)
  })

  it('filters by prefix', () => {
    const r = filterCommands(cmds, 'mo')
    expect(r.map((c) => c.id)).toEqual(['model'])
  })

  it('filters by substring in description', () => {
    const r = filterCommands(cmds, 'screen')
    expect(r.map((c) => c.id)).toEqual(['clear'])
  })

  it('ranks title prefix above description match', () => {
    const r = filterCommands(cmds, 'clear')
    expect(r[0].id).toBe('clear')
  })

  it('filters by multiple terms', () => {
    const r = filterCommands(cmds, 'change theme')
    expect(r.map((c) => c.id)).toContain('theme')
    expect(r.map((c) => c.id)).not.toContain('help')
  })

  it('returns empty when no match', () => {
    expect(filterCommands(cmds, 'zzzzz')).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(filterCommands(cmds, 'MODEL').map((c) => c.id)).toEqual(['model'])
  })

  it('default commands include built-ins', () => {
    expect(defaultCommands.length).toBeGreaterThan(5)
    expect(defaultCommands.find((c) => c.id === 'help')).toBeDefined()
  })
})

describe('moveSelection', () => {
  it('moves down', () => {
    expect(moveSelection(0, 1, 5)).toBe(1)
  })

  it('moves up', () => {
    expect(moveSelection(2, -1, 5)).toBe(1)
  })

  it('wraps from bottom to top', () => {
    expect(moveSelection(4, 1, 5)).toBe(0)
  })

  it('wraps from top to bottom', () => {
    expect(moveSelection(0, -1, 5)).toBe(4)
  })

  it('returns 0 when empty', () => {
    expect(moveSelection(0, 1, 0)).toBe(0)
  })
})