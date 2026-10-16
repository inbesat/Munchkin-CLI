import type { AgentModel } from '@forge/core'

/** No provider adapter, credentials, or outbound network are involved. */
export function createOfflineModel(): AgentModel {
  return {
    id: 'offline-test-model',
    provider: 'offline',
    config: { capabilities: { contextWindow: 200000, maxTokens: 8192 } },
    async *stream() {
      yield { type: 'text-delta', delta: 'Hello world' }
      yield { type: 'usage', usage: { input: 1, output: 2, total: 3 } }
      yield { type: 'finish', reason: 'stop' }
    },
  }
}
