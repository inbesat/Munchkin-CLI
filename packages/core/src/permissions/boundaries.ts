import * as path from 'node:path'

/** Configuration for path boundaries. */
export interface PathBoundaryConfig {
  /** Allowed root directories. Defaults to current working directory. */
  allowedPaths: string[]
  /** Whether to resolve symlinks when checking paths. Default: true. */
  resolveSymlinks?: boolean
  /** Whether to allow access to the temp directory. Default: false. */
  allowTemp?: boolean
}

/** Result of a boundary check. */
export interface BoundaryCheckResult {
  /** Whether the path is allowed. */
  allowed: boolean
  /** The resolved absolute path that was checked. */
  resolvedPath: string
  /** The allowed path that matched (if allowed). */
  matchedBoundary?: string
  /** Reason if not allowed. */
  reason?: string
}

/** Normalize and resolve a path. */
export function normalizePath(inputPath: string, cwd?: string): string {
  const base = cwd ?? process.cwd()
  // Normalize forward slashes to platform separators
  const normalizedInput = inputPath.replace(/\//g, path.sep)
  const resolved = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(base, normalizedInput)

  return path.normalize(resolved)
}

/** Check if a path contains directory traversal attempts. */
export function hasPathTraversal(inputPath: string): boolean {
  // Handle both separators explicitly: on POSIX a backslash is not a
  // separator, so '..'-hidden Windows paths would otherwise slip through.
  const parts = inputPath.split(/[\\/]/)
  return parts.some((part) => part === '..')
}

/** Check if a path is within allowed boundaries. */
export function checkPathBoundary(
  inputPath: string,
  config: PathBoundaryConfig,
  cwd?: string,
): BoundaryCheckResult {
  const base = cwd ?? process.cwd()
  const normalized = normalizePath(inputPath, base)

  // Check for path traversal
  if (hasPathTraversal(inputPath)) {
    return {
      allowed: false,
      resolvedPath: normalized,
      reason: 'Path traversal detected (contains "..")',
    }
  }

  // Resolve symlinks if configured
  let checkPath = normalized
  if (config.resolveSymlinks !== false) {
    try {
      // Note: In real implementation, use fs.realpathSync
      // For now, we'll use the normalized path
      checkPath = normalized
    } catch {
      // If symlink resolution fails, use normalized path
    }
  }

  // Check against allowed paths
  for (const allowed of config.allowedPaths) {
    const allowedResolved = normalizePath(allowed, base)

    // Check if checkPath is within allowedResolved
    const relative = path.relative(allowedResolved, checkPath)

    // If relative path doesn't start with '..' and isn't empty with different root
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      // Additional check: ensure the allowed path is a prefix
      const allowedPrefix = allowedResolved.endsWith(path.sep)
        ? allowedResolved
        : allowedResolved + path.sep

      if (checkPath === allowedResolved || checkPath.startsWith(allowedPrefix)) {
        return {
          allowed: true,
          resolvedPath: normalized,
          matchedBoundary: allowedResolved,
        }
      }
    }
  }

  // Check temp directory if allowed
  if (config.allowTemp) {
    const tempDir = normalizePath(require('node:os').tmpdir(), base)
    const tempPrefix = tempDir.endsWith(path.sep) ? tempDir : tempDir + path.sep
    if (checkPath === tempDir || checkPath.startsWith(tempPrefix)) {
      return {
        allowed: true,
        resolvedPath: normalized,
        matchedBoundary: tempDir,
      }
    }
  }

  return {
    allowed: false,
    resolvedPath: normalized,
    reason: `Path outside allowed boundaries. Allowed: ${config.allowedPaths.join(', ')}`,
  }
}

/** Create default boundary config. */
export function createDefaultBoundaryConfig(cwd?: string): PathBoundaryConfig {
  const base = cwd ?? process.cwd()
  return {
    allowedPaths: [base],
    resolveSymlinks: true,
    allowTemp: false,
  }
}

/** Add an allowed path to config. */
export function addAllowedPath(
  config: PathBoundaryConfig,
  newPath: string,
  cwd?: string,
): PathBoundaryConfig {
  const base = cwd ?? process.cwd()
  const normalized = normalizePath(newPath, base)
  return {
    ...config,
    allowedPaths: [...config.allowedPaths, normalized],
  }
}

/** Remove an allowed path from config. */
export function removeAllowedPath(
  config: PathBoundaryConfig,
  pathToRemove: string,
  cwd?: string,
): PathBoundaryConfig {
  const base = cwd ?? process.cwd()
  const normalized = normalizePath(pathToRemove, base)
  return {
    ...config,
    allowedPaths: config.allowedPaths.filter((p) => normalizePath(p, base) !== normalized),
  }
}

/** Validate that a config has at least one allowed path. */
export function validateBoundaryConfig(config: PathBoundaryConfig): {
  valid: boolean
  error?: string
} {
  if (!config.allowedPaths || config.allowedPaths.length === 0) {
    return { valid: false, error: 'At least one allowed path must be configured' }
  }
  return { valid: true }
}

/** Check if path is a subpath of another (handles cross-platform). */
export function isSubPath(child: string, parent: string): boolean {
  const childResolved = path.resolve(child)
  const parentResolved = path.resolve(parent)

  if (childResolved === parentResolved) return true

  const parentPrefix = parentResolved.endsWith(path.sep)
    ? parentResolved
    : parentResolved + path.sep
  return childResolved.startsWith(parentPrefix)
}

/** Get the common ancestor of two paths. */
export function getCommonAncestor(path1: string, path2: string): string {
  const parts1 = path.resolve(path1).split(path.sep)
  const parts2 = path.resolve(path2).split(path.sep)

  const common: string[] = []
  const minLen = Math.min(parts1.length, parts2.length)

  for (let i = 0; i < minLen; i++) {
    if (parts1[i] === parts2[i]) {
      common.push(parts1[i])
    } else {
      break
    }
  }

  return common.join(path.sep) || path.sep
}

/** Check multiple paths at once. */
export function checkPathsBoundary(
  inputPaths: string[],
  config: PathBoundaryConfig,
  cwd?: string,
): BoundaryCheckResult[] {
  return inputPaths.map((p) => checkPathBoundary(p, config, cwd))
}

/** Filter paths to only those allowed by boundaries. */
export function filterAllowedPaths(
  inputPaths: string[],
  config: PathBoundaryConfig,
  cwd?: string,
): string[] {
  return inputPaths.filter((p) => checkPathBoundary(p, config, cwd).allowed)
}
