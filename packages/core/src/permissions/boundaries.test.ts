import { describe, it, expect, beforeEach } from 'bun:test'
import {
  normalizePath,
  hasPathTraversal,
  checkPathBoundary,
  createDefaultBoundaryConfig,
  addAllowedPath,
  removeAllowedPath,
  validateBoundaryConfig,
  isSubPath,
  getCommonAncestor,
  checkPathsBoundary,
  filterAllowedPaths,
  PathBoundaryConfig,
} from './boundaries'

const TEST_CWD = 'C:\\Users\\test\\project'

describe('Path Boundaries', () => {
  describe('normalizePath', () => {
    it('resolves relative paths', () => {
      expect(normalizePath('src/index.ts', TEST_CWD)).toBe('C:\\Users\\test\\project\\src\\index.ts')
    })

    it('handles absolute paths', () => {
      expect(normalizePath('C:\\absolute\\path.ts', TEST_CWD)).toBe('C:\\absolute\\path.ts')
    })

    it('normalizes separators', () => {
      // src/../project/file.ts from TEST_CWD: goes to project/project/file.ts because src/.. = project, then project/file.ts
      expect(normalizePath('src/../project/file.ts', TEST_CWD)).toBe('C:\\Users\\test\\project\\project\\file.ts')
    })

    it('handles current directory', () => {
      expect(normalizePath('.', TEST_CWD)).toBe('C:\\Users\\test\\project')
    })
  })

  describe('hasPathTraversal', () => {
    it('detects simple .. traversal', () => {
      expect(hasPathTraversal('../etc/passwd')).toBe(true)
      expect(hasPathTraversal('src/../../etc/passwd')).toBe(true)
    })

    it('detects .. in middle of path', () => {
      expect(hasPathTraversal('src/../lib/file.ts')).toBe(true)
    })

    it('allows normal paths', () => {
      expect(hasPathTraversal('src/file.ts')).toBe(false)
      expect(hasPathTraversal('src/subdir/file.ts')).toBe(false)
      expect(hasPathTraversal('.')).toBe(false)
      expect(hasPathTraversal('..')).toBe(true)
    })

    it('handles absolute paths with traversal', () => {
      expect(hasPathTraversal('/usr/../etc/passwd')).toBe(true)
      expect(hasPathTraversal('C:\\Users\\..\\etc\\passwd')).toBe(true)
    })
  })

  describe('checkPathBoundary', () => {
    const baseConfig: PathBoundaryConfig = {
      allowedPaths: [TEST_CWD],
      resolveSymlinks: true,
      allowTemp: false,
    }

    it('allows paths within allowed directory', () => {
      const result = checkPathBoundary('src/index.ts', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(true)
      expect(result.matchedBoundary).toBe('C:\\Users\\test\\project')
    })

    it('allows the allowed directory itself', () => {
      const result = checkPathBoundary('.', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('allows subdirectories', () => {
      const result = checkPathBoundary('src/components/Button.tsx', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('denies paths outside allowed directory', () => {
      const result = checkPathBoundary('../other-project/file.ts', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Path traversal detected')
    })

    it('denies path traversal attempts', () => {
      const result = checkPathBoundary('../../etc/passwd', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Path traversal detected')
    })

    it('denies absolute paths outside boundary', () => {
      const result = checkPathBoundary('C:\\Windows\\System32\\config\\sam', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(false)
    })

    it('allows absolute paths within boundary', () => {
      const result = checkPathBoundary('C:\\Users\\test\\project\\src\\file.ts', baseConfig, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('returns resolved path', () => {
      const result = checkPathBoundary('src/file.ts', baseConfig, TEST_CWD)
      expect(result.resolvedPath).toBe('C:\\Users\\test\\project\\src\\file.ts')
    })
  })

  describe('createDefaultBoundaryConfig', () => {
    it('creates config with cwd as allowed path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      expect(config.allowedPaths).toEqual([TEST_CWD])
      expect(config.resolveSymlinks).toBe(true)
      expect(config.allowTemp).toBe(false)
    })

    it('uses process.cwd when not provided', () => {
      const config = createDefaultBoundaryConfig()
      expect(config.allowedPaths.length).toBe(1)
      expect(config.allowedPaths[0]).toBe(process.cwd())
    })
  })

  describe('addAllowedPath', () => {
    it('adds new allowed path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = addAllowedPath(config, 'C:\\shared\\lib', TEST_CWD)

      expect(newConfig.allowedPaths.length).toBe(2)
      expect(newConfig.allowedPaths).toContain('C:\\shared\\lib')
    })

    it('normalizes the new path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = addAllowedPath(config, 'shared/../shared/lib', TEST_CWD)

      // Relative paths are normalized relative to cwd
      expect(newConfig.allowedPaths).toContain('C:\\Users\\test\\project\\shared\\lib')
    })

    it('does not modify original config', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = addAllowedPath(config, 'C:\\new\\path', TEST_CWD)

      expect(config.allowedPaths.length).toBe(1)
      expect(newConfig.allowedPaths.length).toBe(2)
    })
  })

  describe('removeAllowedPath', () => {
    it('removes existing allowed path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const withExtra = addAllowedPath(config, 'C:\\shared', TEST_CWD)
      const newConfig = removeAllowedPath(withExtra, 'C:\\shared', TEST_CWD)

      expect(newConfig.allowedPaths.length).toBe(1)
      expect(newConfig.allowedPaths).not.toContain('C:\\shared')
    })

    it('handles non-existent path gracefully', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = removeAllowedPath(config, 'C:\\nonexistent', TEST_CWD)

      expect(newConfig.allowedPaths.length).toBe(1)
    })
  })

  describe('validateBoundaryConfig', () => {
    it('validates config with allowed paths', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      expect(validateBoundaryConfig(config)).toEqual({ valid: true })
    })

    it('rejects config with no allowed paths', () => {
      const config: PathBoundaryConfig = { allowedPaths: [], resolveSymlinks: true }
      expect(validateBoundaryConfig(config)).toEqual({
        valid: false,
        error: 'At least one allowed path must be configured',
      })
    })

    it('rejects undefined allowedPaths', () => {
      const config = { allowedPaths: undefined as any, resolveSymlinks: true }
      expect(validateBoundaryConfig(config)).toEqual({
        valid: false,
        error: 'At least one allowed path must be configured',
      })
    })
  })

  describe('isSubPath', () => {
    it('identifies subpaths', () => {
      expect(isSubPath('C:\\Users\\test\\project\\src\\file.ts', 'C:\\Users\\test\\project')).toBe(true)
      expect(isSubPath('C:\\Users\\test\\project', 'C:\\Users\\test\\project')).toBe(true)
    })

    it('rejects non-subpaths', () => {
      expect(isSubPath('C:\\Users\\other\\file.ts', 'C:\\Users\\test\\project')).toBe(false)
      expect(isSubPath('C:\\Windows\\system32', 'C:\\Users')).toBe(false)
    })

    it('handles trailing separators', () => {
      expect(isSubPath('C:\\project\\src', 'C:\\project\\')).toBe(true)
      expect(isSubPath('C:\\project\\src', 'C:\\project')).toBe(true)
    })
  })

  describe('getCommonAncestor', () => {
    it('finds common ancestor', () => {
      expect(getCommonAncestor('C:\\Users\\test\\project\\src', 'C:\\Users\\test\\project\\lib'))
        .toBe('C:\\Users\\test\\project')
    })

    it('handles root paths', () => {
      // On Windows, the common ancestor of C:\a\b and C:\x\y is C:\
      // But path.resolve('C:\a\b') gives 'C:\a\b' which splits to ['C:', 'a', 'b']
      // And path.resolve('C:\x\y') gives ['C:', 'x', 'y']
      // Common is ['C:'] which joins to 'C:'
      expect(getCommonAncestor('C:\\a\\b', 'C:\\x\\y')).toBe('C:')
    })

    it('returns separator for completely different roots', () => {
      // On Windows, different drives
      expect(getCommonAncestor('C:\\a', 'D:\\b')).toBe('\\')
    })
  })

  describe('checkPathsBoundary', () => {
    it('checks multiple paths', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const results = checkPathsBoundary(
        ['src/file1.ts', '../outside.ts', 'lib/file2.ts'],
        config,
        TEST_CWD,
      )

      expect(results.length).toBe(3)
      expect(results[0].allowed).toBe(true)
      expect(results[1].allowed).toBe(false)
      expect(results[2].allowed).toBe(true)
    })
  })

  describe('filterAllowedPaths', () => {
    it('filters to only allowed paths', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const allowed = filterAllowedPaths(
        ['src/file1.ts', '../outside.ts', 'lib/file2.ts'],
        config,
        TEST_CWD,
      )

      // Returns original paths that are allowed
      expect(allowed).toEqual(['src/file1.ts', 'lib/file2.ts'])
    })
  })

  describe('allowTemp option', () => {
    it('allows temp directory when enabled', () => {
      const config: PathBoundaryConfig = {
        allowedPaths: [TEST_CWD],
        resolveSymlinks: true,
        allowTemp: true,
      }

      const tempDir = require('os').tmpdir()
      const tempFile = `${tempDir}\\test-file.txt`

      const result = checkPathBoundary(tempFile, config, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('denies temp directory when disabled', () => {
      const config: PathBoundaryConfig = {
        allowedPaths: [TEST_CWD],
        resolveSymlinks: true,
        allowTemp: false,
      }

      const tempDir = require('os').tmpdir()
      const tempFile = `${tempDir}\\test-file.txt`

      const result = checkPathBoundary(tempFile, config, TEST_CWD)
      expect(result.allowed).toBe(false)
    })
  })

  describe('integration scenarios', () => {
    it('blocks read outside project', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)

      // Try to read from parent directory
      const result = checkPathBoundary('../../../etc/passwd', config, TEST_CWD)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Path traversal detected')
    })

    it('blocks write outside project', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)

      const result = checkPathBoundary('C:\\Users\\test\\other\\output.txt', config, TEST_CWD)
      expect(result.allowed).toBe(false)
    })

    it('allows additional configured directory', () => {
      let config = createDefaultBoundaryConfig(TEST_CWD)
      config = addAllowedPath(config, 'C:\\shared\\data', TEST_CWD)

      const result = checkPathBoundary('C:\\shared\\data\\config.json', config, TEST_CWD)
      expect(result.allowed).toBe(true)
      expect(result.matchedBoundary).toBe('C:\\shared\\data')
    })

    it('handles nested allowed paths', () => {
      let config = createDefaultBoundaryConfig(TEST_CWD)
      config = addAllowedPath(config, 'C:\\shared', TEST_CWD)

      // Both parent and child should work
      expect(checkPathBoundary('C:\\shared\\file.txt', config, TEST_CWD).allowed).toBe(true)
      expect(checkPathBoundary('C:\\shared\\subdir\\file.txt', config, TEST_CWD).allowed).toBe(true)
    })
  })
})