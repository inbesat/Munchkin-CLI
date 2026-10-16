/**
 * Plugin sandbox (Phase 113): a running plugin operates under least
 * privilege. Baseline access is the plugin's own install directory;
 * everything else — extra filesystem roots, shell commands, and secrets —
 * must come from an explicit grant (the manifest `sandbox` section, or the
 * scope the user granted at load time via the Phase-49 permission engine).
 *
 * Dependency-free by repo rule: containment and pattern matching are
 * hand-rolled, every check returns a decision object and never throws.
 */

import { isAbsolute, resolve, sep } from 'node:path'

export interface PluginSandboxGrants {
  /** The plugin's install directory (implicit read + write baseline). */
  pluginDir: string
  /** Extra directories the plugin may read (not write). */
  readPaths?: readonly string[]
  /** Extra directories the plugin may write. */
  writePaths?: readonly string[]
  /** Explicitly allowed shell command patterns; `git *` = prefix match with a word boundary. */
  commands?: readonly string[]
  /** Env/API-key scopes the plugin may read; `OPENAI_*` = prefix match. */
  secretScopes?: readonly string[]
}

export type PluginSandboxSection = Omit<PluginSandboxGrants, 'pluginDir'>

export interface SandboxDecision {
  allowed: boolean
  /** Present when denied; names the plugin and the requirement that failed. */
  reason?: string
}

export type SandboxPathMode = 'read' | 'write'

function deny(plugin: string, requirement: string): SandboxDecision {
  return { allowed: false, reason: `plugin '${plugin}' is not granted ${requirement}` }
}

function allow(): SandboxDecision {
  return { allowed: true }
}

function normalizeRoot(root: string): string {
  const resolved = resolve(root)
  // Case-insensitive on Windows drive paths; keep trailing separator so
  // prefix checks cannot pass on sibling directories that share a stem.
  return (sep === '\\' ? resolved.toLowerCase() : resolved) + sep
}

/** True when `target` resolves inside `root` (both paths normalized). */
function isInsideRoot(root: string, target: string): boolean {
  const normalizedTarget = sep === '\\' ? resolve(target).toLowerCase() : resolve(target)
  return normalizedTarget.startsWith(root)
}

/**
 * Command grants: `git *` and `git` both mean "this command with any or no
 * arguments" (`npm test` matches `npm test -- --watch`, but `gitk` never
 * matches `git`). Matching is case-insensitive.
 */
function commandMatchesGrant(commandLine: string, pattern: string): boolean {
  const cmd = commandLine.trim().toLowerCase()
  const entry = pattern.trim().toLowerCase().replace(/\*$/, '').trimEnd()
  if (entry.length === 0) return false
  return cmd === entry || cmd.startsWith(`${entry} `)
}

/**
 * Secret scopes: `OPENAI_*` is a raw prefix (`OPENAI_API_KEY` matches);
 * an entry without `*` is an exact key name.
 */
function secretMatchesGrant(key: string, pattern: string): boolean {
  const k = key.trim().toLowerCase()
  const entry = pattern.trim().toLowerCase()
  if (entry.endsWith('*')) return k.startsWith(entry.slice(0, -1))
  return k === entry
}

export class PluginSandbox {
  private readonly plugin: string
  private readonly pluginRoot: string
  private readonly grants: PluginSandboxGrants

  constructor(plugin: string, grants: PluginSandboxGrants) {
    this.plugin = plugin
    this.grants = grants
    this.pluginRoot = normalizeRoot(grants.pluginDir)
  }

  /**
   * Build a sandbox from the plugin's install directory plus the manifest's
   * `sandbox` section (unknown manifest fields are tolerated by the
   * Phase-108 parser; anything recognized here becomes a grant).
   */
  static fromManifest(
    plugin: string,
    installDir: string,
    manifestSandbox: PluginSandboxSection = {},
  ): PluginSandbox {
    return new PluginSandbox(plugin, { pluginDir: installDir, ...manifestSandbox })
  }

  /**
   * Filesystem check. Read mode passes on the plugin dir + `readPaths` +
   * `writePaths` roots; write requires the plugin dir or a `writePaths` root.
   */
  checkPathAccess(target: string, mode: SandboxPathMode): SandboxDecision {
    if (!isAbsolute(target)) {
      return deny(this.plugin, `filesystem access via a relative path ('${target}')`)
    }
    if (isInsideRoot(this.pluginRoot, target)) return allow()

    const writeRoots = (this.grants.writePaths ?? []).map(normalizeRoot)
    if (writeRoots.some((root) => isInsideRoot(root, target))) return allow()
    if (mode === 'write') {
      return deny(this.plugin, `write access outside its directory ('${target}')`)
    }

    const readRoots = (this.grants.readPaths ?? []).map(normalizeRoot)
    if (readRoots.some((root) => isInsideRoot(root, target))) return allow()
    return deny(this.plugin, `filesystem access outside its directory ('${target}')`)
  }

  /** Shell check: denied unless the command matches an explicit grant. */
  checkCommand(commandLine: string): SandboxDecision {
    const commandLine_ = commandLine.trim()
    if (commandLine_.length === 0) {
      return deny(this.plugin, 'an empty shell command')
    }
    const granted = (this.grants.commands ?? []).some((pattern) =>
      commandMatchesGrant(commandLine_, pattern),
    )
    return granted
      ? allow()
      : deny(this.plugin, `shell command '${commandLine_}' (no matching grant)`)
  }

  /** Secret/env check: denied unless the key matches a granted scope. */
  checkSecret(key: string): SandboxDecision {
    const key_ = key.trim()
    if (key_.length === 0) return deny(this.plugin, 'an unnamed secret')
    const granted = (this.grants.secretScopes ?? []).some((pattern) =>
      secretMatchesGrant(key_, pattern),
    )
    return granted ? allow() : deny(this.plugin, `secret '${key_}' (scope not granted)`)
  }
}
