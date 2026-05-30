-- 019-source-doc-ingest.sql
-- Change-detection ledger for read-only source-document ingestion (the contract-DOD extractor in
-- src/workers/contract-dod-extract.ts, and any future doc poller). One row per source file; the worker
-- compares mtime to skip files it has already processed. (source_root, relative_path) is the natural
-- key. This table was created ad-hoc in Neon during development; this migration makes it reproducible.
CREATE TABLE IF NOT EXISTS source_doc_ingest (
  source_root      text NOT NULL,
  relative_path    text NOT NULL,
  doc_type         text,
  mtime            timestamptz,
  size_bytes       bigint,
  deceased_name    text,
  parsed           jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_case_key text,
  applied          boolean NOT NULL DEFAULT false,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_run_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_root, relative_path)
);
