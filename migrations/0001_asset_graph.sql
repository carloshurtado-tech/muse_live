-- Muse Live asset graph on D1 (SQLite on the edge).
-- Binding name: MUSE_DB. Create once, then apply:
--   wrangler d1 create muselive-assets
--   wrangler d1 migrations apply muselive-assets
-- (Pages: attach the D1 database as binding MUSE_DB in the dashboard.)
-- KV stays for mirrors, presence, and audit; D1 owns anything queried
-- across shows: the asset register, vendor CRM-lite, and keyword search.

CREATE TABLE IF NOT EXISTS assets (
  serial TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'gear',
  status TEXT NOT NULL DEFAULT 'available',   -- available | checked-out | maintenance | retired
  condition TEXT,                              -- excellent | good | fair | needs-repair
  firmware TEXT,
  location TEXT,                               -- venue / truck / shelf
  maintenance_due TEXT,                        -- ISO date or empty
  checked_out_to TEXT,                         -- person or show key
  checked_out_at INTEGER,
  media_keys TEXT NOT NULL DEFAULT '[]',      -- JSON array of R2 keys (photos, scans)
  updated INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS asset_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT NOT NULL,
  ts INTEGER NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,                        -- created | checkout | checkin | condition | maintenance | firmware | retired | note
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_asset_history_serial ON asset_history (serial, ts DESC);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  rate_day REAL,
  reliability TEXT NOT NULL DEFAULT '',        -- free text: on-time record, quality notes
  notes TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vendor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                          -- show | rate | comms | note
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vendor_events_vendor ON vendor_events (vendor_id, ts DESC);

-- Keyword search across the register (porter stemming, prefix with '"term"*').
CREATE VIRTUAL TABLE IF NOT EXISTS asset_fts USING fts5(serial, name, category, location);
CREATE VIRTUAL TABLE IF NOT EXISTS vendor_fts USING fts5(vid, name, category, contact, email);
