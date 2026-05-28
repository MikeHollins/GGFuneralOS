-- GGFuneralOS Migration 006: Durable audit trail for inline operational edits

CREATE TABLE IF NOT EXISTS operational_item_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        TEXT NOT NULL,
  item_label     TEXT NOT NULL,
  area           TEXT,
  source         TEXT,
  field_name     TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  staff_id       UUID REFERENCES staff(id),
  staff_name     TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_item_audit_item
  ON operational_item_audit(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_item_audit_created
  ON operational_item_audit(created_at DESC);
