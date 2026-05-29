-- Internal per-family contact overrides for the dashboard.
-- Source systems remain read-only; these rows capture staff-confirmed NOK/family contact values.
CREATE TABLE IF NOT EXISTS case_contact_state (
  case_key        TEXT PRIMARY KEY,
  contact_name    TEXT NOT NULL DEFAULT '',
  relationship    TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  staff_initials  TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_contact_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key        TEXT NOT NULL,
  case_name       TEXT NOT NULL DEFAULT '',
  field_name      TEXT NOT NULL DEFAULT 'Family contact',
  old_value       TEXT,
  new_value       TEXT NOT NULL,
  staff_initials  TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_contact_audit_created
  ON case_contact_audit(created_at DESC);
