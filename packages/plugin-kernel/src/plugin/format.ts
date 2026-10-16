/**
 * Plugin packaging format (Phase 108): a forge plugin is a directory named
 * after the plugin containing a `forge.plugin.json` manifest and any subset
 * of the part directories. Distribution channels (npm tarball, git repo,
 * local path) all reduce to "a directory on disk".
 */

export const PLUGIN_MANIFEST_FILE = 'forge.plugin.json'

/** The plugin part directories, in canonical order. */
export const PLUGIN_DIRECTORIES = ['skills', 'hooks', 'agents', 'mcp', 'commands'] as const

export type PluginDirectory = (typeof PLUGIN_DIRECTORIES)[number]

export interface PluginFormatDescription {
  manifestFile: string
  directories: readonly PluginDirectory[]
  /** Human-readable format documentation (the Documentation deliverable). */
  documented: string
}

/** The format definition, suitable for docs generation. */
export function describePluginFormat(): PluginFormatDescription {
  return {
    manifestFile: PLUGIN_MANIFEST_FILE,
    directories: PLUGIN_DIRECTORIES,
    documented: [
      'A forge plugin is a directory containing `forge.plugin.json` (the manifest).',
      '',
      'Layout:',
      '  <plugin-name>/',
      '    forge.plugin.json   # manifest: name, version, description, author, parts',
      '    skills/             # SKILL.md skill folders (Phase 106 loader)',
      '    hooks/              # hook configs / scripts (Phases 103-105 engine)',
      '    agents/             # agent definition .md files (Phase 94 loader)',
      '    mcp/                # MCP server configs (Phase 117+)',
      '    commands/           # slash command definitions',
      '',
      'Manifest shape (forge.plugin.json):',
      '  { name, version, description, author?, forgeVersion?, parts? }',
      '  name: required, string. version: required, semver string.',
      '  parts: optional booleans/objects declaring which parts ship.',
      '',
      'Distribution: npm packages, git repositories, or plain local paths —',
      'all reduce to a directory on disk containing the manifest.',
    ].join('\n'),
  }
}

/** Which of the canonical part directories exist under `pluginDir`. */
export function presentDirectories(pluginDir: string): PluginDirectory[] {
  return PLUGIN_DIRECTORIES.filter((dir) => existsSync(join(pluginDir, dir)))
}

import { existsSync } from 'node:fs'
import { join } from 'node:path'
