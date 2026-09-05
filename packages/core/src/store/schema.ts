import { Database } from 'bun:sqlite'

export interface SessionRow {
  id: string
  title: string | null
  model: string
  cwd: string
  created_at: number
  updated_at: number
  ended_at: number | null
  event_count: number
  input_tokens: number
  output_tokens: number
  total_cost: number
}

export interface SessionInsert {
  id: string
  title?: string | null
  model: string
  cwd: string
  created_at: number
  updated_at: number
  ended_at?: number | null
  event_count: number
  input_tokens: number
  output_tokens: number
  total_cost: number
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT NOT NULL,
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  event_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0
)
`

export function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(CREATE_TABLE)
  return db
}
