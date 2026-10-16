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
