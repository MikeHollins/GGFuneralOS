-- GGFuneralOS Migration 005: Editable operational dashboard items

CREATE TABLE IF NOT EXISTS operational_items (
  item_id        TEXT PRIMARY KEY,
  area           TEXT NOT NULL,
  label          TEXT NOT NULL,
  detail         TEXT NOT NULL DEFAULT '',
  owner          TEXT NOT NULL DEFAULT '',
  due_text       TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT '',
  status_default TEXT NOT NULL DEFAULT '',
  priority       TEXT NOT NULL DEFAULT 'normal',
  options        JSONB NOT NULL DEFAULT '[]',
  source_origin  TEXT NOT NULL DEFAULT 'ggfuneralos',
  source_ref     TEXT,
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_items_area
  ON operational_items(area, is_archived);

CREATE INDEX IF NOT EXISTS idx_operational_items_source_origin
  ON operational_items(source_origin, is_archived);
