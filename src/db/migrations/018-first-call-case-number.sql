-- 018 first_call_intake.case_number: the case number captured at first call. Suggested as the next
-- YY-NNN for the year (highest seen + 1) but editable, since Golden Gate may be on a different
-- counter. Also written to operational_items.source_case_number so it shows in the Case # column.
ALTER TABLE first_call_intake ADD COLUMN IF NOT EXISTS case_number text;
