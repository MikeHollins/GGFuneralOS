-- GGFuneralOS Migration 014: Raw read-only master Google Sheet staging

CREATE TABLE IF NOT EXISTS source_sheet_sync_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running',
  read_sheets       JSONB NOT NULL DEFAULT '[]',
  raw_row_count     INTEGER NOT NULL DEFAULT 0,
  parsed_item_count INTEGER NOT NULL DEFAULT 0,
  archived_row_count INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS source_sheet_rows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id    TEXT NOT NULL,
  sheet_name        TEXT NOT NULL,
  source_ref        TEXT NOT NULL,
  row_number        INTEGER,
  row_values        JSONB NOT NULL DEFAULT '[]',
  content_hash      TEXT NOT NULL,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_run_id  UUID REFERENCES source_sheet_sync_runs(id) ON DELETE SET NULL,
  parse_status      TEXT NOT NULL DEFAULT 'raw',
  parse_message     TEXT,
  is_archived       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (spreadsheet_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_source_sheet_rows_sheet
  ON source_sheet_rows(spreadsheet_id, sheet_name, is_archived);

CREATE INDEX IF NOT EXISTS idx_source_sheet_rows_sync
  ON source_sheet_rows(last_sync_run_id);

CREATE INDEX IF NOT EXISTS idx_source_sheet_runs_started
  ON source_sheet_sync_runs(started_at DESC);
