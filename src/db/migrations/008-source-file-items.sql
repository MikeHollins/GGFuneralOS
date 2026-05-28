-- GGFuneralOS Migration 008: Read-only SMB/Tailscale folder inventory

CREATE TABLE IF NOT EXISTS source_file_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_origin  TEXT NOT NULL DEFAULT 'smb',
  source_root    TEXT NOT NULL,
  relative_path  TEXT NOT NULL,
  parent_path    TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  item_type      TEXT NOT NULL CHECK (item_type IN ('directory', 'file', 'other')),
  extension      TEXT,
  size_bytes     BIGINT,
  modified_at    TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}',
  seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_origin, source_root, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_source_file_items_parent
  ON source_file_items(source_origin, source_root, parent_path, is_archived);

CREATE INDEX IF NOT EXISTS idx_source_file_items_type
  ON source_file_items(source_origin, item_type, is_archived);

CREATE INDEX IF NOT EXISTS idx_source_file_items_seen
  ON source_file_items(source_origin, seen_at DESC);
