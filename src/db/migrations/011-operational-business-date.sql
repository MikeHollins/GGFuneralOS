-- 011 — business_date for recency ordering of the operations feed
--
-- The feed ordered by a fixed area rank then created_at, and created_at is near-uniform
-- (bulk imports — only ~11 distinct minutes across 8,700+ rows). With LIMIT 750 the
-- low-rank areas returned ZERO rows: cremains (3,561), crematory (2,672), production (549),
-- and belongings (166) never reached the client at all. business_date = the row's most
-- recent real date, populated at sync, so the feed can order by recency and surface the
-- active cases across EVERY area within the cap. NULL for rows with no parseable date
-- (sorted last).
ALTER TABLE operational_items ADD COLUMN IF NOT EXISTS business_date DATE;

-- Keep the recency-ordered feed query instant (no full-table sort on every load).
CREATE INDEX IF NOT EXISTS idx_operational_items_business_date
  ON operational_items (business_date DESC NULLS LAST, created_at DESC)
  WHERE is_archived = false;
