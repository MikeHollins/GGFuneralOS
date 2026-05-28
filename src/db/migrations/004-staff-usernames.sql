-- GGFuneralOS Migration 004: Staff usernames for simple internal login

ALTER TABLE staff ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username_unique
  ON staff (lower(username))
  WHERE username IS NOT NULL;
