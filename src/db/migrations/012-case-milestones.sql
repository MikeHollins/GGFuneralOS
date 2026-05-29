-- 012 — Per-family scheduling/location milestone overrides + audit
--
-- The grid's Date/Time and Location cells show source-derived values only. Staff need
-- structured milestone slots (First Call, Service, Cremation, Burial dates; Service,
-- Cremation, Burial locations) that they can override or mark N/A internally — WITHOUT
-- writing back to the read-only source. Source-derived values remain the default; a row
-- here takes precedence. Absence of a row = use the source-derived default. Mirrors the
-- case_workflow_state pattern (migration 010): keyed by the dashboard case grouping key,
-- never touched by the sync, so overrides survive every resync.
CREATE TABLE IF NOT EXISTS case_milestones (
  case_key       TEXT NOT NULL,
  milestone_key  TEXT NOT NULL,                 -- first_call | service | cremation | burial | service_location | cremation_location | burial_location
  value          TEXT NOT NULL DEFAULT '',      -- staff-entered date/time text or location
  is_na          BOOLEAN NOT NULL DEFAULT false,
  staff_initials TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_key, milestone_key)
);

CREATE TABLE IF NOT EXISTS case_milestone_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key       TEXT NOT NULL,
  case_name      TEXT NOT NULL DEFAULT '',
  milestone_key  TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT NOT NULL,
  staff_initials TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_milestone_audit_created ON case_milestone_audit(created_at DESC);
