-- GGFuneralOS Migration 003: Owner-created staff invitation links

CREATE TABLE IF NOT EXISTS staff_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     TEXT NOT NULL UNIQUE,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  contact_email  TEXT,
  contact_phone  TEXT,
  role           TEXT NOT NULL DEFAULT 'staff',
  status         TEXT NOT NULL DEFAULT 'pending',
  created_by     UUID REFERENCES staff(id),
  claimed_by     UUID REFERENCES staff(id),
  expires_at     TIMESTAMPTZ NOT NULL,
  claimed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_status
  ON staff_invites(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_staff_invites_created_by
  ON staff_invites(created_by, created_at DESC);
