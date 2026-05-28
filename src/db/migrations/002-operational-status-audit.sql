-- GGFuneralOS Migration 002: Operational dashboard status and audit trail

CREATE TABLE IF NOT EXISTS operational_statuses (
  item_id        TEXT PRIMARY KEY,
  item_label     TEXT NOT NULL,
  area           TEXT,
  source         TEXT,
  status         TEXT NOT NULL,
  staff_initials TEXT NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_status_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        TEXT NOT NULL,
  item_label     TEXT NOT NULL,
  area           TEXT,
  source         TEXT,
  old_status     TEXT,
  new_status     TEXT NOT NULL,
  staff_initials TEXT NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_audit_item
  ON operational_status_audit(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_audit_created
  ON operational_status_audit(created_at DESC);
