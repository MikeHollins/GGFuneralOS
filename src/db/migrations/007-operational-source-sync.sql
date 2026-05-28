-- GGFuneralOS Migration 007: Read-only source sync metadata for operational items

ALTER TABLE operational_items
  ADD COLUMN IF NOT EXISTS source_payload JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS edited_fields JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_operational_items_source_ref
  ON operational_items(source_origin, source_ref)
  WHERE is_archived = false;
