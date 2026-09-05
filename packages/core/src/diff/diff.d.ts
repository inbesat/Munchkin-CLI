declare module 'diff' {
  export interface DiffResult {
    value: string
    added?: boolean
    removed?: boolean
    count?: number
  }

  export function diffLines(oldStr: string, newStr: string, options?: { ignoreWhitespace?: boolean }): DiffResult[]
  export function diffWords(oldStr: string, newStr: string, options?: { ignoreWhitespace?: boolean }): DiffResult[]
  export function diffChars(oldStr: string, newStr: string, options?: { ignoreWhitespace?: boolean }): DiffResult[]
}