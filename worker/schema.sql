-- Run this against your D1 database:
--   npx wrangler d1 execute fault-diagnosis-db --file=./schema.sql

-- Imported fault knowledge entries (user-contributed)
CREATE TABLE IF NOT EXISTS fault_entries (
  id          TEXT PRIMARY KEY,
  device_type TEXT    NOT NULL DEFAULT '通用',
  title       TEXT    NOT NULL,
  symptoms    TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  keywords    TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  summary     TEXT    NOT NULL DEFAULT '',
  severity    TEXT    NOT NULL DEFAULT '中',
  shutdown_required INTEGER NOT NULL DEFAULT 0,
  estimated_time    TEXT    NOT NULL DEFAULT '',
  causes      TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  solutions   TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  diagram     TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  safety      TEXT    NOT NULL DEFAULT '',
  images      TEXT    NOT NULL DEFAULT '[]',   -- JSON array (metadata only)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Diagnosis history
CREATE TABLE IF NOT EXISTS diagnosis_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  input       TEXT    NOT NULL,
  device_type TEXT    NOT NULL DEFAULT '',
  fault_id    TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  severity    TEXT    NOT NULL DEFAULT '',
  matched_keywords TEXT NOT NULL DEFAULT '[]', -- JSON array
  score       INTEGER NOT NULL DEFAULT 0,
  causes      TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  solutions   TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_created ON diagnosis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_device  ON diagnosis_history(device_type);

-- Imported file tracking (for dedup / audit trail)
CREATE TABLE IF NOT EXISTS imported_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name   TEXT    NOT NULL,
  imported_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
