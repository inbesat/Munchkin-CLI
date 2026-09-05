import type { Database } from 'bun:sqlite'

export interface TokenUsageRow {
  id: number
  session_id: string
  event_index: number
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
  timestamp: number
}

export interface TokenUsageInsert {
  session_id: string
  event_index: number
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  cost: number
  timestamp: number
}

export interface CostSummary {
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  total_cost: number
  call_count: number
}

export interface ModelCostBreakdown {
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cost: number
  call_count: number
}

export interface DailyCostBreakdown {
  date: string
  cost: number
  input_tokens: number
  output_tokens: number
  call_count: number
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
)
`

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id)
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model)
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp)
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider)
`

export function ensureTokenUsageTable(db: Database): void {
  db.exec(CREATE_TABLE)
  for (const sql of CREATE_INDEXES.split('\n').filter((s) => s.trim())) {
    db.exec(sql)
  }
}
