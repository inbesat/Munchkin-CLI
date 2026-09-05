import { describe, expect, it } from 'bun:test'
import {
  insertText,
  backspaceAt,
  deleteAt,
  deleteWordAt,
  getMentionQuery,
  getSlashQuery,
  clampCol,
  reduceEditorKey,
  type EditorKeyInput,
  type BufferState,
} from './editor-buffer'

function key(partial: Partial<EditorKeyInput>): EditorKeyInput {
  return {
    input: '',
    ctrl: false,
    shift: false,
    return: false,
    escape: false,
    backspace: false,
    delete: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    ...partial,
  }
}

function buf(lines: string[], row = 0, col = 0): BufferState {
  return { lines, row, col }
}

describe('editor-buffer helpers', () => {
  describe('clampCol', () => {
    it('clamps to line length', () => {
      expect(clampCol('abc', 5)).toBe(3)
      expect(clampCol('abc', -1)).toBe(0)
      expect(clampCol('abc', 1)).toBe(1)
    })
  })

  describe('insertText', () => {
    it('inserts within a line', () => {
      const r = insertText(['hello'], 0, 5, ' world')
      expect(r.lines).toEqual(['hello world'])
      expect(r.col).toBe(11)
    })

    it('inserts at cursor middle', () => {
      const r = insertText(['hello'], 0, 2, 'XX')
      expect(r.lines).toEqual(['heXXllo'])
      expect(r.col).toBe(4)
    })

    it('splits into multiple lines on newline', () => {
      const r = insertText(['abc'], 0, 1, '\nline2\nline3')
      expect(r.lines).toEqual(['a', 'line2', 'line3bc'])
      expect(r.row).toBe(2)
      expect(r.col).toBe(5)
    })

    it('handles empty insert', () => {
      const r = insertText(['ab'], 0, 1, '')
      expect(r.lines).toEqual(['ab'])
      expect(r.col).toBe(1)
    })
  })

  describe('backspaceAt', () => {
    it('deletes char before cursor', () => {
      const r = backspaceAt(['hello'], 0, 2)
      expect(r.lines).toEqual(['hllo'])
      expect(r.col).toBe(1)
    })

    it('joins lines at start of line', () => {
      const r = backspaceAt(['foo', 'bar'], 1, 0)
      expect(r.lines).toEqual(['foobar'])
      expect(r.row).toBe(0)
      expect(r.col).toBe(3)
    })

    it('no-op at start of first line', () => {
      const r = backspaceAt(['x'], 0, 0)
      expect(r.lines).toEqual(['x'])
    })
  })

  describe('deleteAt', () => {
    it('deletes char after cursor', () => {
      const r = deleteAt(['hello'], 0, 1)
      expect(r.lines).toEqual(['hllo'])
    })

    it('joins lines at end of line', () => {
      const r = deleteAt(['foo', 'bar'], 0, 3)
      expect(r.lines).toEqual(['foobar'])
    })
  })

  describe('deleteWordAt', () => {
    it('deletes previous word', () => {
      const r = deleteWordAt(['foo bar baz'], 0, 11)
      expect(r.lines).toEqual(['foo bar '])
      expect(r.col).toBe(8)
    })

    it('skips trailing whitespace', () => {
      const r = deleteWordAt(['hello world   '], 0, 14)
      expect(r.lines).toEqual(['hello '])
    })
  })

  describe('getSlashQuery', () => {
    it('detects slash command with no space', () => {
      expect(getSlashQuery(['/help'])).toBe('help')
    })

    it('returns null when space present', () => {
      expect(getSlashQuery(['/help me'])).toBeNull()
    })

    it('returns null when not starting with slash', () => {
      expect(getSlashQuery(['help'])).toBeNull()
    })
  })

  describe('getMentionQuery', () => {
    it('detects mention at start', () => {
      expect(getMentionQuery(['@fil'], 0, 4)).toBe('fil')
    })

    it('detects mention after space', () => {
      expect(getMentionQuery(['run @src/mai'], 0, 13)).toBe('src/mai')
    })

    it('returns null after space in query', () => {
      expect(getMentionQuery(['@foo bar'], 0, 8)).toBeNull()
    })

  it('returns null when @ is part of email', () => {
    expect(getMentionQuery(['a@b.com'], 0, 7)).toBeNull()
  })
})

describe('reduceEditorKey', () => {
  it('inserts a single character', () => {
    const r = reduceEditorKey(buf(['']), key({ input: 'h' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['h'], row: 0, col: 1 } })
  })

  it('inserts multiple characters (paste)', () => {
    const r = reduceEditorKey(buf(['']), key({ input: 'hello' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['hello'], row: 0, col: 5 } })
  })

  it('detects slash command query', () => {
    const r = reduceEditorKey(buf(['/hel'], 0, 4), key({ input: 'lo' }))
    expect(r.action.type).toBe('buffer')
    expect(r.slashQuery).toBe('hello')
  })

  it('detects mention query', () => {
    const r = reduceEditorKey(buf(['@fi'], 0, 3), key({ input: 'le' }))
    expect(r.mentionQuery).toBe('file')
  })

  it('returns submit on plain return', () => {
    const r = reduceEditorKey(buf(['x']), key({ return: true }))
    expect(r.action.type).toBe('submit')
  })

  it('inserts newline on shift+return', () => {
    const r = reduceEditorKey(buf(['a'], 0, 1), key({ return: true, shift: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['a', ''], row: 1, col: 0 } })
  })

  it('returns toggleMode on ctrl+b', () => {
    const r = reduceEditorKey(buf(['']), key({ ctrl: true, input: 'b' }))
    expect(r.action.type).toBe('toggleMode')
  })

  it('returns cancel on ctrl+c', () => {
    const r = reduceEditorKey(buf(['']), key({ ctrl: true, input: 'c' }))
    expect(r.action.type).toBe('cancel')
  })

  it('backspace removes character', () => {
    const r = reduceEditorKey(buf(['ab'], 0, 2), key({ backspace: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['a'], row: 0, col: 1 } })
  })

  it('delete removes next character', () => {
    const r = reduceEditorKey(buf(['ab'], 0, 0), key({ delete: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['b'], row: 0, col: 0 } })
  })

  it('left arrow moves cursor', () => {
    const r = reduceEditorKey(buf(['abc'], 0, 2), key({ leftArrow: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['abc'], row: 0, col: 1 } })
  })

  it('right arrow moves cursor', () => {
    const r = reduceEditorKey(buf(['abc'], 0, 1), key({ rightArrow: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['abc'], row: 0, col: 2 } })
  })

  it('up arrow at first line returns historyPrev', () => {
    const r = reduceEditorKey(buf(['line']), key({ upArrow: true }))
    expect(r.action.type).toBe('historyPrev')
  })

  it('down arrow at last line returns historyNext', () => {
    const r = reduceEditorKey(buf(['line']), key({ downArrow: true }))
    expect(r.action.type).toBe('historyNext')
  })

  it('up arrow in multiline moves cursor up', () => {
    const r = reduceEditorKey(buf(['a', 'b'], 1, 0), key({ upArrow: true }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['a', 'b'], row: 0, col: 0 } })
  })

  it('escape clears slash and mention queries', () => {
    const r = reduceEditorKey(buf(['/x'], 0, 2), key({ escape: true }))
    expect(r.slashQuery).toBe('')
    expect(r.mentionQuery).toBe('')
  })

  it('ctrl+u clears to start of line', () => {
    const r = reduceEditorKey(buf(['hello'], 0, 3), key({ ctrl: true, input: 'u' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['lo'], row: 0, col: 0 } })
  })

  it('ctrl+k clears to end of line', () => {
    const r = reduceEditorKey(buf(['hello'], 0, 2), key({ ctrl: true, input: 'k' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['he'], row: 0, col: 2 } })
  })

  it('ctrl+a moves to start of line', () => {
    const r = reduceEditorKey(buf(['hello'], 0, 4), key({ ctrl: true, input: 'a' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['hello'], row: 0, col: 0 } })
  })

  it('ctrl+e moves to end of line', () => {
    const r = reduceEditorKey(buf(['hello'], 0, 1), key({ ctrl: true, input: 'e' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['hello'], row: 0, col: 5 } })
  })

  it('ctrl+w deletes previous word', () => {
    const r = reduceEditorKey(buf(['foo bar'], 0, 7), key({ ctrl: true, input: 'w' }))
    expect(r.action).toEqual({ type: 'buffer', buffer: { lines: ['foo '], row: 0, col: 4 } })
  })
})
})