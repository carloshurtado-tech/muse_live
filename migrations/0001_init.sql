-- Muse Live D1 schema (database: muse-live-db). Applied 2026-10-27 via D1 API.
-- Rerun is safe (IF NOT EXISTS). This file is the source of truth in git;
-- every future push carries it, and the live database already matches it.

-- Append-only audit log (replaces KV read-modify-write arrays).
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  t TEXT NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_day ON audit_log(day);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- Transcripts with keyword search (FTS5, synced by triggers).
CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  show TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(title, body, content='transcripts', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS transcripts_ai AFTER INSERT ON transcripts BEGIN
  INSERT INTO transcripts_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS transcripts_ad AFTER DELETE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS transcripts_au AFTER UPDATE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO transcripts_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- Media registry: one row per R2 object in bucket muse-live-media.
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  show TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  by TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_show ON media(show);
