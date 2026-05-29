-- Prevent concurrent external source syncs from stampeding Google Sheets quota.
CREATE TABLE IF NOT EXISTS source_sync_locks (
  source_id   TEXT PRIMARY KEY,
  lock_token  TEXT NOT NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
