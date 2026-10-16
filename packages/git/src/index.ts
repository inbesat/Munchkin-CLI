// @forge/git - Checkpoints, rewind, worktrees, PR flows
export const VERSION = '0.1.0'

// Checkpointing engine (Phase 131)
export {
  CheckpointEngine,
  type CheckpointEntry,
  type RollbackResult,
  type SnapshotResult,
} from './checkpoints/engine'

// Rewind service (Phase 132)
export {
  RewindService,
  type FileRewindResult,
  type RewindPoint,
  type RewindResult,
} from './checkpoints/rewind'

// Worktree manager CLI handlers (Phase 135)
export {
  worktreeList,
  worktreeCreate,
  worktreeMerge,
  worktreeRemove,
  type WorktreeEntry,
  type WorktreeRun,
} from './worktree/cli'

// Smart commit/PR tools (Phase 133)
export {
  SmartCommitTool,
  smartCommitTool,
  generateCommitMessage,
  classifyChangeType,
  readStatusEntries,
  type ChangeFileEntry,
  type SmartCommitInput,
  type SmartCommitResult,
} from './tools/smart-commit'
export {
  CreatePrTool,
  createPrTool,
  buildPrBody,
  buildCreatePrArgs,
  isGhAuthenticated,
  type PrContext,
} from './tools/create-pr'
export {
  ReviewPrTool,
  reviewPrTool,
  reviewDiff,
  type DiffReview,
  type ReviewFinding,
} from './tools/review-pr'
