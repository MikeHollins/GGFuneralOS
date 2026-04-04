-- GGFuneralOS Migration 001: Upgrade tables for gold-standard features
-- Run after initial schema.sql

-- ─── Intake Portal Sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intake_portal_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,
  phone             TEXT NOT NULL,
  contact_name      TEXT,
  status            TEXT DEFAULT 'active',  -- active, completed, expired
  fields_completed  JSONB DEFAULT '{}',
  files_uploaded    JSONB DEFAULT '[]',
  scheduled_date    TIMESTAMPTZ,            -- arrangement conference date if booked
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_token ON intake_portal_sessions(token);
CREATE INDEX IF NOT EXISTS idx_portal_case ON intake_portal_sessions(case_id);

-- ─── DocuSign Envelopes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS docusign_envelopes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type          TEXT NOT NULL,           -- embalming_auth, cremation_auth, service_contract, insurance_assignment
  envelope_id       TEXT,                    -- DocuSign envelope ID
  status            TEXT DEFAULT 'pending',  -- pending, sent, delivered, signed, declined, voided
  signer_name       TEXT,
  signer_email      TEXT,
  signer_phone      TEXT,
  sent_at           TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  signed_at         TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  reminder_count    INTEGER DEFAULT 0,
  last_reminder_at  TIMESTAMPTZ,
  pdf_url           TEXT,                    -- signed document download URL
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docusign_case ON docusign_envelopes(case_id);
CREATE INDEX IF NOT EXISTS idx_docusign_status ON docusign_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_docusign_envelope ON docusign_envelopes(envelope_id);

-- ─── Payment Transactions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  amount              DECIMAL(10,2) NOT NULL,
  method              TEXT NOT NULL,           -- stripe_card, apple_pay, google_pay, cash, check, insurance, payment_plan
  stripe_payment_id   TEXT,                    -- Stripe PaymentIntent ID
  stripe_invoice_id   TEXT,                    -- Stripe Invoice ID
  stripe_customer_id  TEXT,                    -- Stripe Customer ID
  description         TEXT,
  status              TEXT DEFAULT 'pending',  -- pending, processing, succeeded, failed, refunded, disputed
  receipt_url         TEXT,                    -- Stripe receipt URL
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_case ON payment_transactions(case_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payment_transactions(stripe_payment_id);

-- ─── Insurance Claims ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insurance_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  insurer_name      TEXT NOT NULL,
  policy_number     TEXT,
  face_amount       DECIMAL(10,2),
  assigned_amount   DECIMAL(10,2),
  beneficiary_name  TEXT,
  beneficiary_phone TEXT,
  date_filed        DATE,
  date_acknowledged DATE,
  date_approved     DATE,
  date_paid         DATE,
  amount_paid       DECIMAL(10,2),
  status            TEXT DEFAULT 'pending',  -- pending, filed, acknowledged, approved, paid, denied, appealed
  denial_reason     TEXT,
  follow_up_log     JSONB DEFAULT '[]',      -- [{date, method, notes}]
  insurer_phone     TEXT,
  insurer_fax       TEXT,
  insurer_email     TEXT,
  insurer_address   TEXT,
  claim_number      TEXT,                    -- assigned by insurer
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_case ON insurance_claims(case_id);
CREATE INDEX IF NOT EXISTS idx_insurance_status ON insurance_claims(status);

-- ─── Review Requests (Google Reviews) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES case_contacts(id),
  phone           TEXT,
  email           TEXT,
  review_url      TEXT NOT NULL,
  message_sent    TEXT,
  sent_at         TIMESTAMPTZ,
  reviewed        BOOLEAN DEFAULT false,
  reviewed_at     TIMESTAMPTZ,
  platform        TEXT DEFAULT 'google',     -- google, yelp, facebook
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_case ON review_requests(case_id);

-- ─── Case Files (uploaded media) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS case_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  file_type       TEXT NOT NULL,             -- photo, video, voice_note, document, pdf, dd214
  filename        TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT,
  file_size       INTEGER,
  storage_path    TEXT NOT NULL,             -- local path or cloud URL
  thumbnail_path  TEXT,                      -- for images/videos
  uploaded_by     TEXT,                      -- 'portal', 'staff', 'intake-agent', staff_id
  description     TEXT,
  is_program_photo BOOLEAN DEFAULT false,   -- flagged for use in funeral program
  is_tribute_photo BOOLEAN DEFAULT false,   -- flagged for tribute video
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_case ON case_files(case_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON case_files(file_type);

-- ─── Staff Auth Columns ─────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ─── Auto-update triggers for new tables ────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS docusign_updated_at BEFORE UPDATE ON docusign_envelopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS insurance_updated_at BEFORE UPDATE ON insurance_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
