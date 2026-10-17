// @forge/evals - SWE-bench-lite runner and regression suites
export const VERSION = '0.1.0'

// Condenser Evals (Phase 92)
export {
  buildFixtureSession,
  extractiveSummarizerModel,
  runCondenserEvals,
  type CondenserCase,
  type CondenserEvalReport,
  type CondenserFixture,
  type CondenserModel,
  type CondenserThresholds,
  type EvalGates,
} from './condenser'

// Eval runner + built-in benchmark tasks (Phase 145)
export {
  runEvalTask,
  runEvalSuite,
  type EvalRunOptions,
  type EvalRunResult,
  type EvalSuiteOptions,
  type EvalSuiteReport,
} from './runner'
export { BUILTIN_TASKS, type EvalTask } from './tasks'
