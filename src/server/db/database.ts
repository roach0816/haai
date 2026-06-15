import Database from "better-sqlite3";
import { getConfig } from "../config.js";

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getConfig().databasePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

export function migrate(database = getDb()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      snapshot_id TEXT REFERENCES snapshots(id),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      summary TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      confidence REAL NOT NULL,
      effort TEXT NOT NULL,
      risk TEXT NOT NULL,
      evidence TEXT NOT NULL,
      yaml TEXT NOT NULL,
      install_steps TEXT NOT NULL,
      rollback_steps TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS update_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      current_version TEXT NOT NULL,
      available_version TEXT,
      checked_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);

  database
    .prepare(
      "INSERT OR IGNORE INTO update_state (id, status, current_version) VALUES (1, 'idle', ?)"
    )
    .run(getConfig().version);
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  return JSON.parse(row.value) as T;
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(key, JSON.stringify(value), nowIso());
}
