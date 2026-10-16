import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VersionManager } from './versioning'

function makePluginSource(dir: string, version: string, feature: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'forge.plugin.json'),
    JSON.stringify({ name: 'deploy-helper', version }),
    'utf-8',
  )
  writeFileSync(join(dir, 'feature.txt'), feature, 'utf-8')
}

describe('plugin versioning + rollback (Phase 114)', () => {
  it('installs v1.0, updates to v1.1, rolls back to v1.0, and verifies the directory state', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'forge-versioning-'))
    const v1src = mkdtempSync(join(tmpdir(), 'forge-v1-'))
    const v2src = mkdtempSync(join(tmpdir(), 'forge-v2-'))
    try {
      makePluginSource(v1src, '1.0.0', 'feature-one')
      makePluginSource(v2src, '1.1.1', 'feature-two')

      const manager = new VersionManager(baseDir)
      const install = manager.recordVersion('deploy-helper', v1src, '1.0.0')
      expect(install.ok).toBe(true)

      const active = manager.activeDir('deploy-helper')
      expect(active).toBeDefined()
      if (active === undefined) return
      expect(readFileSync(join(active, 'feature.txt'), 'utf-8')).toBe('feature-one')

      // Update to the latest (1.1.1) and verify the active directory moved.
      const update = manager.update('deploy-helper', v2src, '1.1.1')
      expect(update.ok).toBe(true)
      expect(readFileSync(join(active, 'feature.txt'), 'utf-8')).toBe('feature-two')
      expect(manager.currentVersion('deploy-helper')).toBe('1.1.1')
      expect(manager.list('deploy-helper').map((v) => v.version)).toEqual(['1.0.0', '1.1.1'])

      // Rollback to v1.0 and verify the plugin directory reverted.
      const rollback = manager.rollback('deploy-helper', '1.0.0')
      expect(rollback.ok).toBe(true)
      expect(existsSync(active)).toBe(true)
      expect(readFileSync(join(active, 'feature.txt'), 'utf-8')).toBe('feature-one')
      const manifest = JSON.parse(readFileSync(join(active, 'forge.plugin.json'), 'utf-8')) as {
        version: string
      }
      expect(manifest.version).toBe('1.0.0')
      expect(manager.currentVersion('deploy-helper')).toBe('1.0.0')
      expect(manager.list('deploy-helper')).toHaveLength(2)

      // Rollback without a target at the earliest recorded version refuses:
      // there is nothing earlier to revert to.
      const rollbackDefault = manager.rollback('deploy-helper')
      expect(rollbackDefault.ok).toBe(false)
      expect(rollbackDefault.error).toContain('earliest')
      expect(manager.currentVersion('deploy-helper')).toBe('1.0.0')
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
      rmSync(v1src, { recursive: true, force: true })
      rmSync(v2src, { recursive: true, force: true })
    }
  })

  it('rejects unknown versions, re-recording the same version, and missing plugins', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'forge-versioning-err-'))
    const src = mkdtempSync(join(tmpdir(), 'forge-v-err-'))
    try {
      makePluginSource(src, '1.0.0', 'feature')
      const manager = new VersionManager(baseDir)
      expect(manager.recordVersion('deploy-helper', src, '1.0.0').ok).toBe(true)

      expect(manager.recordVersion('deploy-helper', src, '1.0.0').ok).toBe(false)
      expect(manager.rollback('deploy-helper', '9.9.9').ok).toBe(false)
      expect(manager.rollback('ghost').ok).toBe(false)
      expect(manager.update('deploy-helper', join(src, 'nonexistent'), '2.0.0').ok).toBe(false)
      expect(manager.currentVersion('ghost')).toBeUndefined()
      expect(manager.list('ghost')).toEqual([])
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
      rmSync(src, { recursive: true, force: true })
    }
  })
})
