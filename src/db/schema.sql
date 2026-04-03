-- GGFuneralOS Database Schema
-- PostgreSQL (Neon Serverless)

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE case_phase AS ENUM (
  'FIRST_CALL',
  'PENDING_ARRANGEMENTS',
  'ACTIVE',
  'PREPARATION',
  'SERVICE',
  'POST_SERVICE',
  'AFTERCARE',
  'ARCHIVED'
);

CREATE TYPE disposition_type AS ENUM (
  'BURIAL', 'CREMATION', 'DONATION', 'ENTOMBMENT', 'GREEN_BURIAL', 'OTHER'
);

CREATE TYPE service_type AS ENUM (
  'TRADITIONAL', 'MEMORIAL', 'CELEBRATION_OF_LIFE', 'GRAVESIDE_ONLY',
  'DIRECT_CREMATION', 'DIRECT_BURIAL', 'OTHER'
);

CREATE TYPE payment_status AS ENUM (
  'PENDING', 'PARTIAL', 'PAID', 'INSURANCE_PENDING', 'PAYMENT_PLAN', 'OVERDUE'
);

CREATE TYPE task_status AS ENUM (
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'OVERDUE'
);

CREATE TYPE task_priority AS ENUM (
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
);

CREATE TYPE contact_relationship AS ENUM (
  'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDCHILD', 'GRANDPARENT',
  'FRIEND', 'NEXT_OF_KIN', 'INFORMANT', 'EXECUTOR', 'ATTORNEY',
  'CLERGY', 'OTHER'
);

CREATE TYPE doc_type AS ENUM (
  'PROGRAM', 'OBITUARY', 'CONTRACT', 'GPL', 'DEATH_CERT_WORKSHEET',
  'CREMATION_AUTH', 'EMBALM_AUTH', 'BURIAL_PERMIT', 'INVOICE', 'OTHER'
);

CREATE TYPE social_platform AS ENUM (
  'FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN'
);

CREATE TYPE social_post_status AS ENUM (
  'DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'
);

CREATE TYPE obituary_status AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REVISED'
);

-- ─── Staff ──────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',  -- director, staff, admin, owner
  email         TEXT,
  phone         TEXT,
  pin_hash      TEXT,  -- simple auth for dashboard
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── Cases (central table) ──────────────────────────────────────────────────

CREATE TABLE cases (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number                 SERIAL UNIQUE,
  phase                       case_phase NOT NULL DEFAULT 'FIRST_CALL',

  -- Decedent identification
  decedent_first_name         TEXT,
  decedent_middle_name        TEXT,
  decedent_last_name          TEXT,
  decedent_suffix             TEXT,
  decedent_aka                TEXT,  -- maiden name, nickname
  date_of_birth               DATE,
  date_of_death               DATE,
  time_of_death               TIME,
  ssn_encrypted               TEXT,  -- AES-256-GCM encrypted
  sex                         TEXT,
  race                        TEXT,
  hispanic_origin             TEXT,
  marital_status              TEXT,
  surviving_spouse            TEXT,
  education                   TEXT,
  occupation                  TEXT,
  industry                    TEXT,
  birthplace                  TEXT,
  armed_forces                BOOLEAN DEFAULT false,

  -- Residence
  residence_street            TEXT,
  residence_city              TEXT,
  residence_county            TEXT,
  residence_state             TEXT DEFAULT 'MO',
  residence_zip               TEXT,
  residence_in_city_limits    BOOLEAN,

  -- Parents
  father_name                 TEXT,  -- first, middle, last
  mother_maiden_name          TEXT,  -- first, middle, maiden

  -- Death details
  place_of_death_type         TEXT,  -- hospital, nursing home, residence, hospice, etc.
  place_of_death_facility     TEXT,
  place_of_death_city         TEXT,
  place_of_death_county       TEXT,
  place_of_death_state        TEXT DEFAULT 'MO',
  place_of_death_zip          TEXT,

  -- Disposition & service
  disposition_type            disposition_type,
  service_type                service_type,
  service_date                TIMESTAMPTZ,
  service_time                TIME,
  service_location            TEXT,
  visitation_date             TIMESTAMPTZ,
  visitation_time             TIME,
  visitation_location         TEXT,
  committal_date              TIMESTAMPTZ,
  committal_location          TEXT,
  cemetery_name               TEXT,
  cemetery_city               TEXT,
  cemetery_state              TEXT,
  plot_section                TEXT,
  plot_lot                    TEXT,
  plot_space                  TEXT,
  crematory_name              TEXT,
  urn_destination             TEXT,

  -- Service details
  officiant_name              TEXT,
  officiant_phone             TEXT,
  open_casket                 BOOLEAN,
  music_selections            JSONB DEFAULT '[]',  -- [{title, artist, when}]
  readings                    JSONB DEFAULT '[]',  -- [{text, reader, type}]
  pallbearers                 JSONB DEFAULT '[]',  -- [{name, phone}]
  honorary_pallbearers        JSONB DEFAULT '[]',
  special_requests            TEXT,

  -- Merchandise
  casket_selection            TEXT,
  casket_price                DECIMAL(10,2),
  vault_selection             TEXT,
  vault_price                 DECIMAL(10,2),
  urn_selection               TEXT,
  urn_price                   DECIMAL(10,2),
  program_quantity            INTEGER DEFAULT 100,
  flowers_ordered             BOOLEAN DEFAULT false,

  -- Medical contacts
  attending_physician         TEXT,
  physician_phone             TEXT,
  physician_notified          BOOLEAN DEFAULT false,
  coroner_involved            BOOLEAN DEFAULT false,
  coroner_case_number         TEXT,

  -- Permissions
  permission_to_embalm       BOOLEAN,
  pacemaker_present           BOOLEAN DEFAULT false,
  infectious_disease          BOOLEAN DEFAULT false,

  -- Pre-arrangements
  pre_arrangements_on_file    BOOLEAN DEFAULT false,
  pre_arrangement_number      TEXT,

  -- Financial
  payment_status              payment_status DEFAULT 'PENDING',
  total_charges               DECIMAL(10,2) DEFAULT 0,
  amount_paid                 DECIMAL(10,2) DEFAULT 0,
  insurance_carrier           TEXT,
  insurance_policy_number     TEXT,
  insurance_assignment_filed  BOOLEAN DEFAULT false,
  certified_copies_ordered    INTEGER DEFAULT 0,

  -- Compliance tracking
  death_cert_demographic_complete   BOOLEAN DEFAULT false,
  death_cert_medical_complete       BOOLEAN DEFAULT false,
  death_cert_filed                  BOOLEAN DEFAULT false,
  death_cert_filed_date             DATE,
  burial_permit_obtained            BOOLEAN DEFAULT false,
  cremation_auth_signed             BOOLEAN DEFAULT false,
  embalm_auth_signed                BOOLEAN DEFAULT false,
  contract_signed                   BOOLEAN DEFAULT false,
  gpl_presented                     BOOLEAN DEFAULT false,

  -- Operations
  funeral_director_id         UUID REFERENCES staff(id),
  first_call_received_by      UUID REFERENCES staff(id),
  first_call_date             TIMESTAMPTZ,
  removal_completed           TIMESTAMPTZ,
  arrangement_conference_date TIMESTAMPTZ,

  -- Intake agent tracking
  intake_agent_deployed       BOOLEAN DEFAULT false,
  intake_agent_phone          TEXT,  -- family contact number
  intake_progress             JSONB DEFAULT '{}',  -- {field: collected/pending}

  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cases_phase ON cases(phase);
CREATE INDEX idx_cases_service_date ON cases(service_date);
CREATE INDEX idx_cases_created ON cases(created_at DESC);
CREATE INDEX idx_cases_director ON cases(funeral_director_id);

-- ─── Case Contacts ──────────────────────────────────────────────────────────

CREATE TABLE case_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT,
  relationship    contact_relationship NOT NULL,
  is_nok          BOOLEAN DEFAULT false,  -- next of kin
  is_informant    BOOLEAN DEFAULT false,  -- death cert informant
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contacts_case ON case_contacts(case_id);

-- ─── Case Tasks (auto-generated per phase) ──────────────────────────────────

CREATE TABLE case_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  phase           case_phase NOT NULL,
  task_name       TEXT NOT NULL,
  description     TEXT,
  status          task_status DEFAULT 'PENDING',
  priority        task_priority DEFAULT 'MEDIUM',
  assigned_to     UUID REFERENCES staff(id),
  deadline        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES staff(id),
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_case ON case_tasks(case_id);
CREATE INDEX idx_tasks_status ON case_tasks(status);
CREATE INDEX idx_tasks_deadline ON case_tasks(deadline);

-- ─── Case Documents ─────────────────────────────────────────────────────────

CREATE TABLE case_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type        doc_type NOT NULL,
  filename        TEXT NOT NULL,
  content_url     TEXT,  -- storage URL or local path
  pdf_data        BYTEA,  -- or store inline for small docs
  generated_by    TEXT DEFAULT 'system',  -- agent name or staff
  version         INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_docs_case ON case_documents(case_id);

-- ─── Case Timeline (audit trail) ────────────────────────────────────────────

CREATE TABLE case_timeline (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,  -- phase_change, task_completed, document_generated, note_added, etc.
  description     TEXT NOT NULL,
  actor           TEXT,  -- staff name, agent name, or 'system'
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_timeline_case ON case_timeline(case_id);
CREATE INDEX idx_timeline_created ON case_timeline(created_at DESC);

-- ─── Obituaries ─────────────────────────────────────────────────────────────

CREATE TABLE obituaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  status              obituary_status DEFAULT 'DRAFT',
  full_text           TEXT,
  summary_text        TEXT,  -- short version for social media
  biographical_data   JSONB DEFAULT '{}',  -- structured data used to generate
  survivors_list      JSONB DEFAULT '[]',
  preceded_by         JSONB DEFAULT '[]',
  memorial_donations  TEXT,
  family_approved     BOOLEAN DEFAULT false,
  family_approved_at  TIMESTAMPTZ,
  published_to        JSONB DEFAULT '[]',  -- [{platform, url, published_at}]
  version             INTEGER DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_obits_case ON obituaries(case_id);

-- ─── Programs ───────────────────────────────────────────────────────────────

CREATE TABLE programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  template_name       TEXT NOT NULL DEFAULT 'classic-elegant',
  front_cover         JSONB DEFAULT '{}',  -- {heading, name, dates, photo_url, quote}
  inside_left         JSONB DEFAULT '{}',  -- {order_of_service: [{item, detail}]}
  inside_right        JSONB DEFAULT '{}',  -- {obituary_text, photo_collage_urls}
  back_cover          JSONB DEFAULT '{}',  -- {acknowledgment, pallbearers, donations, funeral_home}
  pdf_data            BYTEA,
  print_quantity      INTEGER DEFAULT 100,
  print_status        TEXT DEFAULT 'pending',  -- pending, sent_to_print, printed
  version             INTEGER DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_programs_case ON programs(case_id);

-- ─── Social Posts ───────────────────────────────────────────────────────────

CREATE TABLE social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID REFERENCES cases(id) ON DELETE SET NULL,  -- null for non-case posts (educational, community)
  platform            social_platform NOT NULL,
  post_type           TEXT NOT NULL,  -- memorial, educational, community, behind_scenes, pre_planning
  content             TEXT NOT NULL,
  media_urls          JSONB DEFAULT '[]',
  cta_text            TEXT,
  cta_url             TEXT,
  status              social_post_status DEFAULT 'DRAFT',
  scheduled_for       TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  platform_post_id    TEXT,  -- returned by platform API
  engagement          JSONB DEFAULT '{}',  -- {likes, shares, comments, reach}
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_case ON social_posts(case_id);
CREATE INDEX idx_social_status ON social_posts(status);
CREATE INDEX idx_social_scheduled ON social_posts(scheduled_for);

-- ─── Intake Agent Conversations ─────────────────────────────────────────────

CREATE TABLE intake_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  phone_number    TEXT NOT NULL,
  direction       TEXT NOT NULL,  -- inbound, outbound
  message_text    TEXT NOT NULL,
  field_collected TEXT,  -- which data field this message collected, if any
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_intake_conv_case ON intake_conversations(case_id);
CREATE INDEX idx_intake_conv_phone ON intake_conversations(phone_number);

-- ─── Helper: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER obituaries_updated_at BEFORE UPDATE ON obituaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER programs_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
