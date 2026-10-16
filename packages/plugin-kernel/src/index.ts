// @forge/plugin-kernel - Plugin loader, hook engine, and marketplace
export const VERSION = '0.1.0'

// Hook engine + event bus (Phase 103)
export {
  HookEngine,
  BLOCK,
  type HookOutcome,
  type HookEmitResult,
  type HookRegistration,
  type HookResultEntry,
} from './hooks/engine'
export {
  LIFECYCLE_EVENTS,
  type GenericHookPayload,
  type HookEventName,
  type HookEventPayloads,
} from './hooks/events'

// Skill system (Phase 106)
export {
  loadSkills,
  type LoadedSkill,
  type SkillLoadError,
  type SkillSource,
  type LoadSkillsOptions,
} from './skills/loader'
export {
  matchSkills,
  invokeSkill,
  reminderLine,
  type SkillMatch,
} from './skills/matcher'
export {
  autoTriggerSkills,
  loadAndAutoTrigger,
  semanticSimilarity,
  type AutoTriggerMatch,
  type AutoTriggerOptions,
  type SemanticScoreOptions,
} from './skills/auto-trigger'

// Plugin packaging format (Phase 108)
export {
  PLUGIN_DIRECTORIES,
  PLUGIN_MANIFEST_FILE,
  describePluginFormat,
  presentDirectories,
  type PluginDirectory,
  type PluginFormatDescription,
} from './plugin/format'
export {
  loadPlugin,
  parsePluginManifest,
  type ForgePluginManifest,
  type LoadedPlugin,
} from './plugin/manifest'
export {
  loadPlugins,
  loadPluginFromDirectory,
  loadPluginFromNpm,
  satisfiesForgeVersion,
  type ForgeVersion,
  type LoadedPluginEntry,
  type LoadPluginsOptions,
  type PluginLoadError,
  type PluginLoadReport,
  type PluginSourceDescriptor,
} from './plugin/loader'
export {
  createPolicyGate,
  feedbackFrom,
  registerToolPolicy,
  type PolicyDecision,
  type PolicyGate,
  type ToolPolicyOptions,
} from './hooks/blocking'

// Marketplace protocol (Phase 110)
export {
  MarketplaceClient,
  parseMarketplace,
  type InstallOptions,
  type InstallRequest,
  type MarketplaceCatalog,
  type MarketplaceClientOptions,
  type MarketplaceEntry,
  type MarketplaceResult,
  type ParsedMarketplace,
} from './marketplace/protocol'
export {
  MarketplaceRegistry,
  type InstalledPlugin,
} from './marketplace/registry'
export {
  OFFICIAL_MARKETPLACE_URL,
  STARTER_MARKETPLACE_SOURCE,
  findStarterMarketplace,
  type StarterMarketplace,
} from './marketplace/starter'

// TUI plugin API (Phase 112) - pure registry; the TUI app consumes it.
export {
  TuiPluginApi,
  type RegisterResult,
  type TuiCommand,
  type TuiCommandContext,
  type TuiDialog,
  type TuiKeybinding,
  type TuiPaletteEntry,
  type TuiRoute,
} from './tui/api'
