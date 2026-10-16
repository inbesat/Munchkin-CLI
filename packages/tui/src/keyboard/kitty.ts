/** Kitty keyboard protocol enablers (send to the terminal to opt in). */
export const KITTY_ENABLE = '\x1b[>1u'
export const KITTY_DISABLE = '\x1b[>0u'

export interface KittyKey {
  /** Resolved key name or character, e.g. 'Tab', 'Enter', 'a', 'i'. */
  key: string
  /** Raw matched sequence (excluding the leading ESC). */
  raw: string
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
  /** True when the protocol reported this as a named/disambiguated key. */
  named: boolean
}

/** Named-key codes (function-row style) used by the Kitty protocol. */
const NAMED_KEYS: Record<number, string> = {
  9: 'Tab',
  13: 'Enter',
  27: 'Escape',
  32: 'Space',
  8: 'Backspace',
  127: 'Backspace',
  57358: 'F1',
  57359: 'F2',
  57360: 'F3',
  57361: 'F4',
  57362: 'F5',
  57363: 'F6',
  57364: 'F7',
  57365: 'F8',
  57366: 'F9',
  57367: 'F10',
  57368: 'F11',
  57369: 'F12',
  57370: 'F13',
  57371: 'F14',
  57372: 'F15',
  57373: 'F16',
  57374: 'F17',
  57375: 'F18',
  57376: 'F19',
  57377: 'F20',
  57399: 'Home',
  57400: 'End',
  57401: 'PageUp',
  57402: 'PageDown',
  57393: 'ArrowUp',
  57394: 'ArrowDown',
  57395: 'ArrowRight',
  57396: 'ArrowLeft',
  57423: 'Insert',
  57424: 'Delete',
}

function decodeMods(mods: number) {
  return {
    shift: (mods & 1) !== 0,
    alt: (mods & 2) !== 0,
    ctrl: (mods & 4) !== 0,
    meta: (mods & 8) !== 0,
  }
}

/**
 * Parse a Kitty keyboard-protocol CSI-u sequence (everything after the ESC).
 * Format: `[<code>;<mods>;<keytype>u`. Returns null if it does not match.
 * The keytype flag (3rd field) disambiguates named keys (e.g. Tab) from
 * character input that shares a code (e.g. Ctrl+I → 'i'), which is the core
 * win of the Kitty protocol.
 */
export function parseKittyKey(seq: string): KittyKey | null {
  const m = /^\[(\d+)(?:;(\d+))?(?:;(\d+))?u$/.exec(seq)
  if (!m) return null
  const code = Number.parseInt(m[1], 10)
  const mods = Number.parseInt(m[2] ?? '0', 10)
  const keytype = Number.parseInt(m[3] ?? '1', 10)
  const { shift, alt, ctrl, meta } = decodeMods(mods)

  const named = keytype === 2 || code in NAMED_KEYS
  let key: string
  if (named && code in NAMED_KEYS) {
    key = NAMED_KEYS[code]
  } else if (code >= 32 && code <= 126) {
    // Printable ASCII: apply ctrl by masking the 0x40 bit (Ctrl+A = 1, etc.)
    const ch = ctrl ? code & 0x7f : code
    key = String.fromCharCode(ch === 0x7f ? 0x08 : ch).toLowerCase()
    if (code === 9 && !ctrl) key = 'Tab'
  } else if (code in NAMED_KEYS) {
    key = NAMED_KEYS[code]
  } else {
    key = `key${code}`
  }

  return { key, raw: seq, shift, alt, ctrl, meta, named }
}
