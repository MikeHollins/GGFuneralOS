-- First-class source facts for the operations dashboard.
-- These are derived from read-only source systems and kept separate from the
-- raw source_payload so staff edits can override dates without losing auditability.
ALTER TABLE operational_items ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE operational_items ADD COLUMN IF NOT EXISTS source_case_number TEXT;

CREATE INDEX IF NOT EXISTS idx_operational_items_source_case_number
  ON operational_items(source_case_number)
  WHERE is_archived = false AND source_case_number IS NOT NULL;
