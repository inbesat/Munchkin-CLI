/** SGR (1006) mouse reporting enablers. */
export const MOUSE_ENABLE = '\x1b[?1006h'
export const MOUSE_DISABLE = '\x1b[?1006l'

export type MouseButton = 'left' | 'middle' | 'right'
export type MouseAction = 'press' | 'release' | 'drag' | 'wheel-up' | 'wheel-down'

export interface MouseEvent {
  button: MouseButton | null
  x: number
  y: number
  action: MouseAction
  shift: boolean
  alt: boolean
  ctrl: boolean
}

function decodeMods(b: number) {
  return {
    shift: (b & 4) !== 0,
    alt: (b & 8) !== 0,
    ctrl: (b & 16) !== 0,
  }
}

/**
 * Parse an SGR (1006) encoded mouse report. Format:
 * ESC [ < b ; x ; y (M|m)
 * - trailing 'M' = press/move/wheel, 'm' = release.
 * - b & 64 → wheel (b&1 ? down : up); b & 32 → drag.
 * Pure and testable; returns null if the sequence is not SGR mouse format.
 */
export function parseMouseSGR(seq: string): MouseEvent | null {
  const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(seq)
  if (!m) return null
  const b = Number.parseInt(m[1], 10)
  const x = Number.parseInt(m[2], 10)
  const y = Number.parseInt(m[3], 10)
  const trailing = m[4]
  const { shift, alt, ctrl } = decodeMods(b)

  let action: MouseAction
  let button: MouseButton | null
  if (trailing === 'm') {
    action = 'release'
    button = null
  } else if (b & 64) {
    action = b & 1 ? 'wheel-down' : 'wheel-up'
    button = null
  } else {
    const raw = b & 3
    button = raw === 1 ? 'middle' : raw === 2 ? 'right' : 'left'
    action = b & 32 ? 'drag' : 'press'
  }

  return { button, x, y, action, shift, alt, ctrl }
}
