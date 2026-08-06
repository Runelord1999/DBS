-- GFM Delivery Workbench — schema
-- Entities follow Build Brief Section 3. Deviations are documented in
-- docs/ASSUMPTIONS.md ("Schema deviations") — none are silent.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Reference / configuration tables (admin-editable, seeded with defaults)
-- ---------------------------------------------------------------------------

-- Capacity + sizing assumptions. Kept in the DB rather than hardcoded so the
-- admin can correct the placeholders from Section 13 without a code change.
CREATE TABLE IF NOT EXISTS assumption (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  unit        TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tier 1 t-shirt bands (Section 6). Placeholder ranges — calibrate against
-- historical projects before the capacity numbers are treated as trustworthy.
CREATE TABLE IF NOT EXISTS tshirt_band (
  size             TEXT PRIMARY KEY CHECK (size IN ('S','M','L','XL')),
  sort_order       INTEGER NOT NULL,
  duration_label   TEXT NOT NULL,
  amount_min       REAL,
  amount_max       REAL,
  amount_label     TEXT NOT NULL,
  systems_label    TEXT NOT NULL,
  effort_days_min  REAL NOT NULL,
  effort_days_max  REAL,
  calibrated       INTEGER NOT NULL DEFAULT 0
);

-- Complexity adjustment factors (Section 6). Uplift is additive and always
-- positive — the brief requires estimates move up, never silently down.
CREATE TABLE IF NOT EXISTS complexity_factor (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  uplift_pct  REAL NOT NULL CHECK (uplift_pct >= 0),
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

-- RAG streams/topics. Placeholder list — replace with the streams actually
-- tracked (Section 13).
CREATE TABLE IF NOT EXISTS rag_stream (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS person (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE,
  role            TEXT NOT NULL CHECK (role IN
                    ('PM','Biz Lead','Tech Lead','Developer','Tester','Tech BA')),
  team            TEXT NOT NULL CHECK (team IN ('PM team','Biz Lead team','Tech')),
  employment_type TEXT NOT NULL CHECK (employment_type IN ('perm','contractor')),
  active          INTEGER NOT NULL DEFAULT 1,
  -- NULL => fall back to the global capacity.effective_days_per_year assumption.
  effective_days_per_year REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_person_role_active ON person(role, active);

-- Login identity, separate from Person: PSC members and admins consume the
-- tool without being a resourceable person, and not every person logs in.
CREATE TABLE IF NOT EXISTS app_user (
  id            INTEGER PRIMARY KEY,
  person_id     INTEGER REFERENCES person(id) ON DELETE SET NULL,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  access_role   TEXT NOT NULL CHECK (access_role IN
                  ('admin','pm','biz_lead','resource','psc')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS session (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project (
  id                INTEGER PRIMARY KEY,
  code              TEXT UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  -- "governed if >= $3m, else not" — stored, but the API also derives the
  -- expected tier from budget and flags mismatches rather than overwriting.
  psc_tier          TEXT NOT NULL DEFAULT 'Non-PSC'
                      CHECK (psc_tier IN ('PSC-governed','Non-PSC')),
  sponsor           TEXT,
  pm_owner_id       INTEGER REFERENCES person(id) ON DELETE SET NULL,
  biz_lead_owner_id INTEGER REFERENCES person(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','on-hold','closed')),
  start_date        TEXT,
  target_end_date   TEXT,
  budget_type       TEXT NOT NULL DEFAULT 'budgeted'
                      CHECK (budget_type IN ('budgeted','unbudgeted','enhancement demand')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_status ON project(status);
CREATE INDEX IF NOT EXISTS idx_project_tier ON project(psc_tier);
CREATE INDEX IF NOT EXISTS idx_project_pm ON project(pm_owner_id);
CREATE INDEX IF NOT EXISTS idx_project_bl ON project(biz_lead_owner_id);

CREATE TABLE IF NOT EXISTS milestone (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  planned_date TEXT,
  actual_date  TEXT,
  status       TEXT NOT NULL DEFAULT 'not started'
                 CHECK (status IN ('not started','in progress','done','delayed')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestone_project ON milestone(project_id);
CREATE INDEX IF NOT EXISTS idx_milestone_planned ON milestone(planned_date);

-- One project has many RAG entries, one per stream — that is what surfaces
-- "issues" rather than a single blended health flag.
CREATE TABLE IF NOT EXISTS rag_entry (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  stream       TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('Red','Amber','Green')),
  commentary   TEXT,
  updated_by   INTEGER REFERENCES person(id) ON DELETE SET NULL,
  updated_date TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rag_project ON rag_entry(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_status ON rag_entry(status);
CREATE INDEX IF NOT EXISTS idx_rag_stream ON rag_entry(stream);

CREATE TABLE IF NOT EXISTS budget_line (
  id              INTEGER PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  budgeted_amount REAL NOT NULL DEFAULT 0,
  actual_spend    REAL NOT NULL DEFAULT 0,
  forecast_spend  REAL NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'SGD',
  budget_status   TEXT NOT NULL DEFAULT 'approved'
                    CHECK (budget_status IN ('approved','pending','unbudgeted')),
  fiscal_year     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_project ON budget_line(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_fy ON budget_line(fiscal_year);

CREATE TABLE IF NOT EXISTS resource_allocation (
  id             INTEGER PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  -- NULL = role-level placeholder with nobody named yet. Demand converted from
  -- a sized DemandItem lands here: you know you need 40 Tech BA days before you
  -- know whose 40 days they are. Placeholders still consume role capacity.
  person_id      INTEGER REFERENCES person(id) ON DELETE SET NULL,
  role           TEXT NOT NULL CHECK (role IN
                   ('PM','Biz Lead','Tech Lead','Developer','Tester','Tech BA')),
  allocation_pct REAL NOT NULL CHECK (allocation_pct > 0),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','converted_demand')),
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alloc_project ON resource_allocation(project_id);
CREATE INDEX IF NOT EXISTS idx_alloc_person ON resource_allocation(person_id);
CREATE INDEX IF NOT EXISTS idx_alloc_role_dates
  ON resource_allocation(role, start_date, end_date);

-- ---------------------------------------------------------------------------
-- Demand intake (Sections 5 + 6)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demand_item (
  id                INTEGER PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  source            TEXT NOT NULL CHECK (source IN
                      ('BAU enhancement','new regulatory','business request','other')),
  requested_by      TEXT,
  date_raised       TEXT NOT NULL DEFAULT (date('now')),
  status            TEXT NOT NULL DEFAULT 'New' CHECK (status IN
                      ('New','T-Shirt Sized','Triage','Approved','Rejected','Deferred')),
  tshirt_size       TEXT CHECK (tshirt_size IS NULL OR tshirt_size IN ('S','M','L','XL')),
  linked_project_id INTEGER REFERENCES project(id) ON DELETE SET NULL,
  -- Added fields. Pipeline demand cannot be placed on a capacity timeline
  -- without a candidate window; without these the "test against remaining
  -- capacity before approval" step in Section 4.5 has no period to test in.
  indicative_start_date TEXT,
  indicative_end_date   TEXT,
  decision_note     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_demand_status ON demand_item(status);

-- Checklist, not a black-box multiplier: every applied factor is a visible row.
CREATE TABLE IF NOT EXISTS demand_complexity_factor (
  demand_item_id INTEGER NOT NULL REFERENCES demand_item(id) ON DELETE CASCADE,
  factor_key     TEXT NOT NULL REFERENCES complexity_factor(key) ON DELETE CASCADE,
  PRIMARY KEY (demand_item_id, factor_key)
);

CREATE TABLE IF NOT EXISTS sizing_estimate (
  id                    INTEGER PRIMARY KEY,
  demand_item_id        INTEGER NOT NULL REFERENCES demand_item(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN
                          ('PM','Biz Lead','Tech Lead','Developer','Tester','Tech BA')),
  phase                 TEXT NOT NULL CHECK (phase IN
                          ('Discovery','Build','Test','Deploy')),
  estimated_person_days REAL NOT NULL CHECK (estimated_person_days >= 0),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (demand_item_id, role, phase)
);
CREATE INDEX IF NOT EXISTS idx_sizing_demand ON sizing_estimate(demand_item_id);
