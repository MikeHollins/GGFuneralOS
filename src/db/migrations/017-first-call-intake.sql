-- 017 first_call_intake: system-of-record for the first-call intake event.
-- A first-call case is born here, then projected onto the board as an operational_items row with
-- source_origin='ggfuneralos' (so the sheet sync never archives it) keyed by name+death-year, plus
-- a case_contact_state (NOK) and case_workflow_state (first-call done). date_of_death and nok_name
-- are NOT NULL so a case cannot open without the field that starts the MoEVR legal clock or the
-- legal authorizing party.

CREATE TABLE IF NOT EXISTS first_call_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key text NOT NULL,
  operational_item_id text,
  -- 1. deceased
  deceased_first text NOT NULL DEFAULT '',
  deceased_middle text NOT NULL DEFAULT '',
  deceased_last text NOT NULL DEFAULT '',
  deceased_suffix text NOT NULL DEFAULT '',
  date_of_birth text,
  date_of_death text NOT NULL,
  time_of_death text,
  sex text,
  -- 2. place of death
  death_place_type text,
  death_facility_name text,
  death_address text,
  pronounced boolean NOT NULL DEFAULT false,
  pronounced_by text,
  me_involved boolean NOT NULL DEFAULT false,
  -- 3. caller & legal next of kin
  caller_name text,
  caller_phone text,
  caller_relationship text,
  nok_name text NOT NULL,
  nok_phone text,
  nok_email text,
  nok_relationship text,
  -- 4. removal / transfer
  pickup_location text,
  ready_for_pickup boolean NOT NULL DEFAULT false,
  release_authorized boolean NOT NULL DEFAULT false,
  embalm_permission text NOT NULL DEFAULT 'pending', -- yes | no | pending
  removal_team text,
  -- 5. disposition intent
  disposition_intent text NOT NULL DEFAULT 'undecided', -- burial | cremation | undecided
  pacemaker_present text NOT NULL DEFAULT 'unknown',    -- yes | no | unknown
  prearrangement boolean NOT NULL DEFAULT false,
  -- 6. next step
  arrangement_conference_at timestamptz,
  director_assigned text,
  notes text NOT NULL DEFAULT '',
  -- audit
  created_by_initials text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_first_call_intake_case_key ON first_call_intake(case_key);
CREATE INDEX IF NOT EXISTS idx_first_call_intake_created_at ON first_call_intake(created_at DESC);
