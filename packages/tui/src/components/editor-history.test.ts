import { describe, expect, it } from 'bun:test'
import { EditorHistory } from './editor-history'

describe('EditorHistory', () => {
  it('adds entries and ignores empty', () => {
    const h = new EditorHistory()
    expect(h.size()).toBe(0)
    h.add('')
    expect(h.size()).toBe(0)
    h.add('   ')
    expect(h.size()).toBe(0)
    h.add('hello')
    expect(h.size()).toBe(1)
  })

  it('trims trailing whitespace', () => {
    const h = new EditorHistory()
    h.add('hello   ')
    expect(h.all()[0].content).toBe('hello')
  })

  it('does not duplicate consecutive identical entries', () => {
    const h = new EditorHistory()
    h.add('hello')
    h.add('hello')
    expect(h.size()).toBe(1)
  })

  it('navigates backward and forward', () => {
    const h = new EditorHistory()
    h.add('first')
    h.add('second')
    h.add('third')
    expect(h.previous()).toBe('third')
    expect(h.previous()).toBe('second')
    expect(h.previous()).toBe('first')
    expect(h.previous()).toBe(null)
    expect(h.next()).toBe('second')
    expect(h.next()).toBe('third')
    expect(h.next()).toBe(null)
  })

  it('navigates a multi-entry history', () => {
    const h = new EditorHistory()
    h.add('old')
    h.add('mid')
    h.add('new')
    expect(h.previous()).toBe('new')
    expect(h.previous()).toBe('mid')
    expect(h.previous()).toBe('old')
    expect(h.previous()).toBe(null)
    expect(h.next()).toBe('mid')
    expect(h.next()).toBe('new')
    expect(h.next()).toBe(null)
  })

  it('reset moves index to end', () => {
    const h = new EditorHistory()
    h.add('a')
    h.add('b')
    h.previous()
    h.reset()
    expect(h.previous()).toBe('b')
  })

  it('tracks mode per entry', () => {
    const h = new EditorHistory()
    h.add('ls', 'bash')
    h.add('explain', 'prompt')
    expect(h.all()[0].mode).toBe('bash')
    expect(h.all()[1].mode).toBe('prompt')
  })

  it('contains checks content', () => {
    const h = new EditorHistory()
    h.add('foo')
    expect(h.contains('foo')).toBe(true)
    expect(h.contains('bar')).toBe(false)
  })

  it('clear empties entries', () => {
    const h = new EditorHistory()
    h.add('x')
    h.clear()
    expect(h.size()).toBe(0)
  })
})
