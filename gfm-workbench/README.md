# GFM Delivery Workbench

A shared workbench for the GFM PM and Biz Lead/Analyst teams: ~50 concurrent
projects with their schedule, RAG, budget and resourcing, plus a demand intake
queue that is tested against the team's real capacity ceiling before anything is
approved.

The point of the tool is the capacity mechanic. Without it this is a project
list; with it, unplanned demand gets triaged against a constraint that is visible
to everyone, instead of being absorbed silently.

---

## What this is

A **full-stack application with a persistent server-side database** — not a
single-page mockup. Browser storage holds nothing but the session token; all
portfolio data lives in the database and is shared across users.

```
gfm-workbench/
├── server/                  Node + Express API, SQLite via better-sqlite3
│   ├── src/
│   │   ├── db/              schema.sql, connection, reference/config data
│   │   ├── domain/          capacity.js, sizing.js, periods.js  ← the model
│   │   ├── routes/          REST endpoints, one file per area
│   │   └── lib/             auth (scrypt + sessions), http helpers, CSV
│   ├── seed/                fabricated demo data (seed.js + fixtures.js)
│   └── test/                48 tests — node:test, no framework
├── web/                     React 19 + Vite + Tailwind v4
│   └── src/
│       ├── pages/           the eight screens
│       ├── components/      chart, layout and UI primitives
│       └── lib/             api client, auth context, formatting
└── docs/ASSUMPTIONS.md      every open question and placeholder ← read this
```

---

## Running it

Requires Node 20+ (developed on 22).

```bash
cd gfm-workbench
npm install          # installs both workspaces

npm run seed         # loads the fabricated demo portfolio
npm run dev          # API on :4000, UI on :5173 with hot reload
```

Then open <http://localhost:5173>.

For a single-process deployment (one server, one port) build the front end first
— Express serves it from `web/dist`:

```bash
npm run build
npm start            # everything on :4000
```

Other commands:

| Command | Does |
|---|---|
| `npm test` | runs the server test suite |
| `npm run seed:reset` | clears the portfolio and reloads demo data |
| `npm run dev:api` / `npm run dev:web` | run one side on its own |

The database file defaults to `gfm-workbench/data/workbench.db` and is
**gitignored**. Override with `GFM_DB_PATH`.

### Demo sign-ins

The seed prints these when it finishes. Every account uses the password
`Workbench!Demo2026` — fine for fabricated data, replace before anything real.

| Account | Role | Sees |
|---|---|---|
| `admin@gfm.example` | Admin | Everything, plus assumptions and user management |
| a PM address from the seed output | PM | Owns and edits their own projects |
| a Biz Lead address | Biz Lead | Same, from the business side |
| a technical staff address | Resource | Read-only view of their own allocations |
| `psc.chair@gfm.example` | PSC | Read-only portfolio + PSC pack |

---

## The published demo

`deliveryworkbench.html` at the repository root is a static build of this app —
one self-contained file, like the other DBS dashboards, published on the site
and linked from the root `index.html`. It is the Section 11 pitch artifact:
leadership opens a URL and sees the capacity ceiling being breached, with no
infrastructure to stand up first.

```bash
npm run seed        # if you have not already
npm run build:demo  # regenerates deliveryworkbench.html
```

The page has exactly one network request — itself. The SQLite wasm runtime and
the seeded dataset are embedded as data URIs, so it works from any URL, and
from `file://` if someone just wants to open a copy locally.

**It runs the real application, not a mock.** The build aliases `express` to a
small router shim (`web/src/demo/express-shim.js`) and runs
`server/src/routes/*.js` unmodified against a wasm SQLite copy of the seeded
database. Every handler, validation rule, permission check and capacity
calculation is the same code the Node server runs — so the demo cannot drift
from the tool, and fixing a bug in one fixes it in the other.

What that buys, and what it costs:

- Everything works: filters, drill-in, editing, the sizing rubric, the capacity
  check, approving demand, CSV export. Approve the sized Triage item and Tech BA
  moves from 114% to 117.4% committed in FY26 Q4, exactly as it would live.
- Writes are real but local. The database lives in the browser tab; reloading
  restores the seeded portfolio. Nothing is shared between viewers.
- There is no sign-in. A **View as** switcher swaps between seeded personas
  instead, which shows the role-shaped screens better than a login form does —
  a resourced team member sees three nav items, the PSC sees seven and can edit
  nothing.
- It costs about 1 MB gzipped, mostly the SQLite wasm runtime and the dataset.

`scripts/export-demo-db.mjs` refuses to package a database whose people are not
all on `@gfm.example` addresses, so a live portfolio cannot be built into a
publicly served page by accident.

**The demo is not the tool.** It is a read-through-a-window version for pitching.
Real use needs the Node server, a real database, and the hosting decision in
[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

---

## The capacity model

This is the part worth arguing with, so it is stated plainly. It lives in
`server/src/domain/capacity.js` and is covered by tests.

1. Each active person has an **effective capacity** of N delivery days per year
   — working days minus leave, public holidays, training and BAU buffer.
   The default is **200**, a placeholder from the build brief. Per-person
   overrides beat the global figure.
2. **Capacity(role, period)** = the sum of effective days for active people in
   that role, pro-rated onto the period by working days.
3. **Committed demand(role, period)** = the sum of `allocation_pct × effective
   days` over each allocation's overlap with the period.
4. **Utilisation = demand ÷ capacity.** At or above 100% is a breach.
5. **Pipeline demand** — sized but unapproved items — is reported as a separate
   band, so "what we have committed to" and "what is coming at us" never merge.

Both sides of the ratio use the same effective-day scaling, so a 1.0 FTE
allocation running a full year consumes exactly one person-year rather than
260/200 = 130%.

Two things are deliberately *not* charged to a role:

- An item with only a t-shirt size has no role split. Assigning one would be an
  invented number, so it is listed as **unsized** instead.
- An item with no indicative window cannot be placed in a period, so it is
  listed as **unscheduled**.

Both appear on the capacity screen rather than being quietly dropped.

---

## Sizing rubric

Two tiers, per the build brief.

**Tier 1 — t-shirt size** is applied at intake and is fast by design. The bands
(duration, indicative $, systems touched, blended person-days) are configurable
in Admin and are flagged as uncalibrated until someone marks them otherwise.

**Tier 2 — role × phase person-days** is what capacity actually consumes, and is
**mandatory before approval**: a t-shirt size cannot be tested against capacity
*by role*. The API refuses to approve without it.

**Complexity factors** apply a flat uplift per checked factor (+10–15% each) and
are rendered as a visible checklist with the arithmetic shown — baseline, each
factor, the resulting total. They can never reduce an estimate; the API rejects
a negative uplift.

The tool also cross-checks the two tiers against each other. If the Tier 2 total
falls outside the band the t-shirt size implies, it says so and leaves both
alone — that mismatch usually means a human should look.

### Approval converts

Approving a demand item creates, in one transaction: the Project, a BudgetLine,
and one ResourceAllocation per sized role. Those allocations are created
**unassigned** — sizing says 40 Tech BA days are needed, not whose 40 days they
are — and they consume role capacity immediately, so the utilisation number
moves the moment the decision is made rather than when someone gets named.

If approval would breach the ceiling the API returns 409 with the breaches
listed. It can still be approved, but only with an explicit acknowledgement and
a recorded reason.

---

## Roles and access

Enforced server-side on every route, not just hidden in the UI.

| Role | Read | Write |
|---|---|---|
| `admin` | everything | everything, plus assumptions, rubric and users |
| `pm` | everything | projects they own, demand items |
| `biz_lead` | everything | projects they own, demand items |
| `resource` | portfolio, capacity, **own** allocations only | nothing |
| `psc` | everything | nothing |

Read access is broad on purpose: the argument the tool exists to make only works
if the constraint is visible to everyone. Write access is narrow.

Sign-in is email + password (scrypt, sessions in the database). Directory/SSO
integration is a Phase 2 infrastructure conversation — see
[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

---

## Screens

| # | Screen | What it is for |
|---|---|---|
| 1 | Workbench home | Exec summary: RAG rollup, capacity headline, pipeline count |
| 2 | Portfolio grid | All projects, sortable and filterable by tier, status, RAG, owner |
| 3 | Project detail | Schedule + milestones, RAG per stream, budget, resourcing — editable by owners |
| 4 | RAG dashboard | Portfolio-wide exceptions with commentary, grouped by stream |
| 5 | Budget tracker | Budgeted vs actual vs forecast, and unbudgeted exposure |
| 6 | **Resourcing & capacity** | The model above, visualised. The centrepiece |
| 7 | Demand intake | Kanban across the six workflow states, sizing visible on every card |
| 8 | PSC pack | Steering-committee view, printable, with CSV export |

Plus **My allocations** for resourced team members and **Admin** for the
assumptions, the rubric and user access.

Every table exports to CSV. Charts carry a legend, direct labels on the values
that matter, a hover tooltip, and a table view — no value is reachable only by
hovering.

---

## Data governance

**No real bank data belongs in this repository, ever.** The repo holds code and
fabricated seed data only.

- The live database is gitignored (`data/`, `*.db`), as are `exports/` and any
  stray `*.csv`.
- The seed data is **entirely invented** — not anonymised real records. Project
  codenames, sponsors, people and figures are all fictional. A demo built on
  lightly-disguised real data is a governance problem the first time someone
  screenshots it.
- **Before any real project name, budget figure or headcount goes into this
  tool, hosting and data handling need infosec/infra sign-off.** SQLite on an
  internal server is the current default because it needs no infrastructure to
  start — that is a starting point to confirm, not a decision that has been
  made. See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

There is no cloud SaaS backend and no external service dependency.

**GitHub Pages cannot host the application.** It is static-only: it cannot run
the API, and it cannot persist anything shared between users. What is published
there is the demo described above — a fabricated dataset running in the
viewer's own browser. That page sits at a **publicly readable URL**, which is
fine precisely because every figure on it is invented. It must never become the
home of the real tool, and the demo dataset must never be regenerated from a
live database (the export script blocks this).

---

## Build status against the brief

**Phase 1 (MVP) — complete.** Data model and CRUD for every entity including
SizingEstimate; seed script running through the real schema; portfolio grid and
project detail; the capacity screen with the Section 4 maths; Tier 1 sizing on
demand items.

**Phase 2 — complete.** Demand intake Kanban with the full workflow, Tier 2
sizing and complexity factors, budget rollups, PSC pack with export.

**Phase 3 — partly done.** Role-based access is enforced from day one rather
than deferred. Still open: saved views, richer filters, and the auth hardening
that comes with a real SSO decision.

Known gaps, deliberately left:

- Sizing spreads flat across an item's window. A phase-aware curve would be more
  realistic but there is no historical data to shape one with yet.
- No audit trail beyond `updated_by` / `updated_date` on RAG entries.
- Single currency. Multi-currency needs an FX policy decision first.
- Desktop-first, as specified — mobile layouts are not tuned.
