import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDefaultFileAccessConfig, strReplaceEdit, validateFilePath } from './file-utils'

describe('strReplaceEdit literal replacement', () => {
  it('inserts replacement text containing $ patterns literally', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-edit-'))
    const file = join(dir, 'sample.txt')
    try {
      writeFileSync(file, 'before OLD after', 'utf-8')
      const result = await strReplaceEdit(file, 'OLD', "$& $` $$ $'")
      expect(result.success).toBe(true)
      expect(readFileSync(file, 'utf-8')).toBe("before $& $` $$ $' after")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('validateFilePath symlink policy', () => {
  let dir: string
  let outside: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-boundary-'))
    outside = mkdtempSync(join(tmpdir(), 'forge-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE_SECRET', 'utf-8')
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(outside, join(dir, 'escape'), linkType)
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('rejects paths that escape the allowed root through a symlink', () => {
    const config = createDefaultFileAccessConfig(dir)
    expect(config.followSymlinks).toBe(false)
    const viaSymlink = join(dir, 'escape', 'secret.txt')
    expect(() => validateFilePath(viaSymlink, config, 'read')).toThrow()
  })

  it('still accepts regular paths inside the allowed root', () => {
    const config = createDefaultFileAccessConfig(dir)
    validateFilePath(join(dir, 'plain.txt'), config, 'write')
  })

  it('rejects when an existing parent component is a symlink escaping the root', () => {
    const config = createDefaultFileAccessConfig(dir)
    mkdirSync(join(dir, 'escape', 'nested'), { recursive: true })
    const newFile = join(dir, 'escape', 'nested', 'new-file.txt')
    expect(() => validateFilePath(newFile, config, 'write')).toThrow()
  })
})
