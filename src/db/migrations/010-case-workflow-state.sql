-- 010 — Durable per-family workflow checklist state + audit
--
-- The grid checklist was purely visual: done/not-done was inferred from source status text
-- with no way for staff to directly check a step off. This adds a durable per-(case,step)
-- override so staff can mark a step done/pending (or revert to auto-derived), with an audit
-- trail. Keyed by the dashboard's case grouping key (case_match_key / normalized name).
-- Absence of a row for a (case_key, step_id) means "auto" — derived from case evidence.
CREATE TABLE IF NOT EXISTS case_workflow_state (
  case_key       TEXT NOT NULL,
  step_id        TEXT NOT NULL,
  state          TEXT NOT NULL,                 -- 'done' | 'pending'
  staff_initials TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_key, step_id)
);

CREATE TABLE IF NOT EXISTS case_workflow_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key       TEXT NOT NULL,
  case_name      TEXT NOT NULL DEFAULT '',
  step_id        TEXT NOT NULL,
  old_state      TEXT,                          -- 'done' | 'pending' | 'auto' | null
  new_state      TEXT NOT NULL,                 -- 'done' | 'pending' | 'auto'
  staff_initials TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_workflow_audit_created ON case_workflow_audit(created_at DESC);
