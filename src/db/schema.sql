-- ScholarFinder schema (Tiger Cloud Postgres)

-- gen_random_uuid() is built into core since PG13, but pgcrypto makes it safe on older/forked builds.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imessage_id   TEXT UNIQUE NOT NULL, -- space/user id from Spectrum
  display_name  TEXT,
  solana_wallet TEXT, -- student-provided devnet wallet for rewards
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preferences (
  student_id          UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  culture             TEXT,      -- startup | corporate | liberal_arts | research | arts
  setting             TEXT,      -- urban | suburban | rural
  aid_type            TEXT,      -- full_ride | full_tuition | partial | any
  min_world_ranking   INTEGER,
  max_world_ranking   INTEGER,
  subject             TEXT,
  subject_ranking_max INTEGER,
  sat_score           INTEGER,
  ielts_score         NUMERIC(2,1),
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS universities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'USA',
  city            TEXT,
  state           TEXT,
  setting         TEXT,          -- urban | suburban | rural
  culture_tags    TEXT[],        -- e.g. {startup, corporate}
  world_ranking   INTEGER,
  aid_site_url    TEXT,
  admissions_email TEXT,
  admissions_phone TEXT,
  photo_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keystone table: one row per (university, fact_key) with provenance + confidence.
-- Reconciliation agent is the only writer of status; gatherers write candidate rows
-- to scholarship_fact_candidates, reconciliation promotes them here.
CREATE TABLE IF NOT EXISTS scholarship_fact_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  fact_key        TEXT NOT NULL,     -- e.g. 'international_eligible', 'aid_type', 'need_aware'
  fact_value      TEXT NOT NULL,
  source_agent    TEXT NOT NULL,     -- browser | call | email | seed
  provenance_url  TEXT,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.5, -- 0..1
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scholarship_facts (
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  fact_key        TEXT NOT NULL,
  fact_value      TEXT NOT NULL,
  confidence      NUMERIC(3,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | conflicting | stale
  provenance      JSONB NOT NULL DEFAULT '[]',        -- array of {source_agent, url, value, observed_at}
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (university_id, fact_key)
);

CREATE TABLE IF NOT EXISTS swipes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id  UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  decision       TEXT NOT NULL,     -- yes | no | skip
  rank_score     NUMERIC(5,2),      -- from profile-match agent, for ordering
  card_text      TEXT,              -- explainer agent output shown to the student
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, university_id)
);

CREATE TABLE IF NOT EXISTS outreach_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  custom_questions TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | calling | completed | failed
  transcript      TEXT,
  twilio_call_sid TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS outreach_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  custom_questions TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | sent | replied | failed
  sent_body       TEXT,
  reply_body      TEXT,
  parsed_facts    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS requirements_packets (
  university_id       UUID PRIMARY KEY REFERENCES universities(id) ON DELETE CASCADE,
  deadline_ed          DATE,
  deadline_rd          DATE,
  required_docs        TEXT[] NOT NULL DEFAULT '{}',
  aid_forms             TEXT[] NOT NULL DEFAULT '{}', -- CSS Profile | ISFAA | institutional form
  test_policy           TEXT,                          -- required | optional | not_accepted
  application_fee_usd   NUMERIC(6,2),
  fee_waiver_available  BOOLEAN,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS true_cost (
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id         UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  cost_of_attendance_usd NUMERIC(10,2),
  award_usd              NUMERIC(10,2),
  health_insurance_usd   NUMERIC(10,2) NOT NULL DEFAULT 2500,
  visa_sevis_fees_usd    NUMERIC(10,2) NOT NULL DEFAULT 410,
  flights_usd            NUMERIC(10,2) NOT NULL DEFAULT 1200,
  student_fees_usd       NUMERIC(10,2) NOT NULL DEFAULT 500,
  net_cost_usd           NUMERIC(10,2),
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, university_id)
);

CREATE TABLE IF NOT EXISTS deadlines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id  UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  deadline_date  DATE NOT NULL,
  label          TEXT NOT NULL,   -- e.g. 'Regular Decision', 'CSS Profile'
  reminded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_change_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id  UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  fact_key       TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  note           TEXT
);

CREATE TABLE IF NOT EXISTS rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id  UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  amount_sol     NUMERIC(10,6) NOT NULL,
  tx_signature   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facts_university ON scholarship_facts(university_id);
CREATE INDEX IF NOT EXISTS idx_candidates_university_fact ON scholarship_fact_candidates(university_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_swipes_student ON swipes(student_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(deadline_date);
