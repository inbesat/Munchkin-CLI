import { describe, expect, it } from 'bun:test'
import * as nodePath from 'node:path'
import {
  type PathBoundaryConfig,
  addAllowedPath,
  checkPathBoundary,
  checkPathsBoundary,
  createDefaultBoundaryConfig,
  filterAllowedPaths,
  getCommonAncestor,
  hasPathTraversal,
  isSubPath,
  normalizePath,
  removeAllowedPath,
  validateBoundaryConfig,
} from './boundaries'

const IS_WIN = process.platform === 'win32'
// Native absolute base per host: drive path on Windows, POSIX absolute elsewhere.
const TEST_CWD = IS_WIN ? 'C:\\Users\\test\\project' : '/Users/test/project'
const TMP_ALLOWED = IS_WIN ? 'C:\\shared' : '/shared'

describe('Path Boundaries', () => {
  describe('normalizePath', () => {
    it('resolves relative paths', () => {
      expect(normalizePath('src/index.ts', TEST_CWD)).toBe(
        nodePath.resolve(TEST_CWD, 'src/index.ts'),
      )
    })

    it('keeps native absolute paths absolute', () => {
      const absolute = IS_WIN ? 'C:\\absolute\\path.ts' : '/absolute/path.ts'
      expect(normalizePath(absolute, TEST_CWD)).toBe(absolute)
    })

    it('normalizes separators in relative paths', () => {
      // src/../project/file.ts from TEST_CWD: goes to project/project/file.ts because src/.. = project, then project/file.ts
      expect(normalizePath('src/../project/file.ts', TEST_CWD)).toBe(
        nodePath.resolve(TEST_CWD, 'src/../project/file.ts'),
      )
    })

    it('handles current directory', () => {
      expect(normalizePath('.', TEST_CWD)).toBe(nodePath.resolve(TEST_CWD))
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
      expect(result.matchedBoundary).toBe(nodePath.resolve(TEST_CWD))
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
      const outside = IS_WIN ? 'C:\\Windows\\System32\\config\\sam' : '/etc/passwd'
      const result = checkPathBoundary(outside, baseConfig, TEST_CWD)
      expect(result.allowed).toBe(false)
    })

    it('allows native absolute paths within boundary', () => {
      const inside = nodePath.join(TEST_CWD, 'src', 'file.ts')
      const result = checkPathBoundary(inside, baseConfig, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('returns resolved path', () => {
      const result = checkPathBoundary('src/file.ts', baseConfig, TEST_CWD)
      expect(result.resolvedPath).toBe(nodePath.resolve(TEST_CWD, 'src/file.ts'))
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
      const absolute = nodePath.join(TEST_CWD, 'shared', 'lib')
      const newConfig = addAllowedPath(config, absolute, TEST_CWD)

      expect(newConfig.allowedPaths.length).toBe(2)
      expect(newConfig.allowedPaths).toContain(absolute)
    })

    it('normalizes the new path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = addAllowedPath(config, 'shared/../shared/lib', TEST_CWD)

      // Relative paths are normalized relative to cwd
      expect(newConfig.allowedPaths).toContain(nodePath.resolve(TEST_CWD, 'shared/lib'))
    })

    it('does not modify original config', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = addAllowedPath(config, nodePath.join(TEST_CWD, 'new'), TEST_CWD)

      expect(config.allowedPaths.length).toBe(1)
      expect(newConfig.allowedPaths.length).toBe(2)
    })
  })

  describe('removeAllowedPath', () => {
    it('removes existing allowed path', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const absolute = nodePath.join(TMP_ALLOWED, 'sub')
      const withExtra = addAllowedPath(config, absolute, TEST_CWD)
      const newConfig = removeAllowedPath(withExtra, absolute, TEST_CWD)

      expect(newConfig.allowedPaths.length).toBe(1)
      expect(newConfig.allowedPaths).not.toContain(absolute)
    })

    it('handles non-existent path gracefully', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const newConfig = removeAllowedPath(config, nodePath.join(TMP_ALLOWED, 'none'), TEST_CWD)

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
      // biome-ignore lint/suspicious/noExplicitAny: intentionally malformed config to exercise validation
      const config = { allowedPaths: undefined as any, resolveSymlinks: true }
      expect(validateBoundaryConfig(config)).toEqual({
        valid: false,
        error: 'At least one allowed path must be configured',
      })
    })
  })

  describe('isSubPath', () => {
    it('identifies subpaths', () => {
      const parent = nodePath.join(TEST_CWD, 'sub')
      expect(isSubPath(nodePath.join(parent, 'file.ts'), parent)).toBe(true)
      expect(isSubPath(parent, parent)).toBe(true)
    })

    it('rejects non-subpaths', () => {
      const root = IS_WIN ? 'C:\\Users\\test' : '/Users/test'
      const other = IS_WIN ? 'C:\\Users\\other' : '/Users/other'
      expect(isSubPath(nodePath.join(other, 'file.ts'), root)).toBe(false)
      expect(isSubPath(IS_WIN ? 'D:\\data' : '/data', root)).toBe(false)
    })

    it('handles trailing separators', () => {
      const src = nodePath.join(TEST_CWD, 'src')
      const project = IS_WIN ? TEST_CWD + '\\' : TEST_CWD + '/'
      expect(isSubPath(src, project)).toBe(true)
      expect(isSubPath(src, TEST_CWD)).toBe(true)
    })
  })

  describe('getCommonAncestor', () => {
    it('finds common ancestor', () => {
      const a = nodePath.join(TEST_CWD, 'a')
      const b = nodePath.join(TEST_CWD, 'b')
      expect(getCommonAncestor(a, b)).toBe(TEST_CWD)
    })

    it('handles different trees under one root', () => {
      if (IS_WIN) {
        expect(getCommonAncestor('C:\\x\\a', 'C:\\y\\b')).toBe('C:')
      } else {
        expect(getCommonAncestor('/x/a', '/y/b')).toBe('/')
      }
    })

    it('returns separator for different drive roots (Windows)', () => {
      // POSIX has a single root, so different-drive roots only exist on Windows.
      expect(getCommonAncestor(IS_WIN ? 'C:\\a' : '/a/1', IS_WIN ? 'D:\\b' : '/a/2')).toBe(
        IS_WIN ? '\\' : '/a',
      )
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

      const tempFile = nodePath.join(require('node:os').tmpdir(), 'test-file.txt')
      const result = checkPathBoundary(tempFile, config, TEST_CWD)
      expect(result.allowed).toBe(true)
    })

    it('denies temp directory when disabled', () => {
      const config: PathBoundaryConfig = {
        allowedPaths: [TEST_CWD],
        resolveSymlinks: true,
        allowTemp: false,
      }

      const tempFile = nodePath.join(require('node:os').tmpdir(), 'test-file.txt')
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

    it('blocks native-absolute write outside project', () => {
      const config = createDefaultBoundaryConfig(TEST_CWD)
      const outside = nodePath.join(nodePath.dirname(TEST_CWD), 'other', 'output.txt')
      const result = checkPathBoundary(outside, config, TEST_CWD)
      expect(result.allowed).toBe(false)
    })

    it('allows additional configured directory', () => {
      let config = createDefaultBoundaryConfig(TEST_CWD)
      const shared = IS_WIN ? 'C:\\shared\\data' : '/shared/data'
      config = addAllowedPath(config, shared, TEST_CWD)

      const result = checkPathBoundary(nodePath.join(shared, 'config.json'), config, TEST_CWD)
      expect(result.allowed).toBe(true)
      expect(result.matchedBoundary).toBe(shared)
    })

    it('handles nested allowed paths', () => {
      let config = createDefaultBoundaryConfig(TEST_CWD)
      const shared = IS_WIN ? 'C:\\shared' : '/shared'
      config = addAllowedPath(config, shared, TEST_CWD)

      // Both parent and child should work
      expect(checkPathBoundary(nodePath.join(shared, 'file.txt'), config, TEST_CWD).allowed).toBe(
        true,
      )
      expect(
        checkPathBoundary(nodePath.join(shared, 'subdir', 'file.txt'), config, TEST_CWD).allowed,
      ).toBe(true)
    })
  })
})
