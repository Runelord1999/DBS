# Assumptions, placeholders and open decisions

The build brief listed a set of things to confirm before the tool's numbers can
be trusted. None of them were confirmable at build time, so every one has been
implemented as an **editable value with a visible placeholder marker** rather
than a hardcoded constant. Nothing here was decided by default.

Anything marked ▲ is still a guess.

---

## 1. Section 13 checklist

### ▲ Effective capacity days per person per year — placeholder: 200

Where it lives: `assumption.capacity.effective_days_per_year`, editable in
**Admin**. Per-person overrides sit on `person.effective_days_per_year` and win
over the global figure.

This is the single most load-bearing number in the tool. Every utilisation
percentage, every breach, and every "can we take this on" answer scales with it.
Both capacity and demand use the same figure, so changing it does not distort
the ratio — but it does move where the ceiling sits relative to a fixed book of
work.

**To confirm:** the real GFM figure. Annualised working days minus leave
entitlement, public holidays, training, and whatever BAU/support load the
delivery teams carry. If contractors and perms differ materially, set
per-person overrides rather than averaging them away.

### ▲ Fiscal year start — placeholder: January (month 1)

Where it lives: `assumption.fiscal_year.start_month`.

Drives budget period rollups and the quarter labels on the capacity screen. With
the placeholder, FY2026 = calendar 2026 and Q1 = Jan–Mar. A fiscal year is
labelled by the calendar year it *starts* in; if GFM labels its fiscal years by
the year they end, the label convention in `periods.js` needs a one-line change
alongside the start month.

### ▲ RAG streams — placeholder list

Where it lives: the `rag_stream` table, editable in **Admin** (add, rename,
retire).

Currently seeded with: Tech delivery, Business requirements, UAT, Vendor,
Budget, Resourcing, Regulatory/compliance. These came from the brief's examples
and are almost certainly not the exact set GFM reports on.

**To confirm:** the real list. Retiring a stream keeps historical entries intact.

### ▲ SQLite vs existing database infrastructure

Currently SQLite via `better-sqlite3`, file-based, at `data/workbench.db`.

Chosen because it needs no infrastructure to stand up and is enough for 33
concurrent users against ~50 projects. It is a single-writer engine; concurrent
reads are fine, concurrent writes serialise. At this team size that is not a
practical limit.

**To confirm:** whether GFM already has database infrastructure this should
point at instead. Migrating to Postgres is a contained change — the schema is
plain SQL and all access goes through `server/src/db/`. Doing it before real
data goes in is much cheaper than after.

### ▲ Hosting — undecided, and deliberately not decided here

The app runs as a single Node process serving both the API and the built front
end, so it will run on any internal server that can run Node 20+.

**To confirm, before real data:** where it actually runs, who administers it,
how it is backed up, and whether any component touches anything outside DBS
infrastructure. There is currently no external service dependency and no cloud
SaaS backend, which is intentional — that property should be preserved
deliberately rather than by accident.

Note that publishing this repository is a **code** decision, not a hosting
decision. GitHub Pages is static-only: it cannot run the API or persist
anything.

### ▲ Tier 1 t-shirt bands — placeholder ranges, uncalibrated

Where it lives: the `tshirt_band` table, editable in **Admin**, with a
`calibrated` flag that starts at 0 and can be set once someone has actually
checked the ranges.

The duration, dollar and person-day ranges came straight from the brief and are
a starting guess. They matter less than they look: Tier 1 does **not** feed the
capacity maths — Tier 2 does. Tier 1 is used for triage and as a cross-check
that flags when a detailed estimate disagrees with the size someone assigned.

**To confirm:** calibrate against completed projects. Until then the capacity
numbers are trustworthy in structure but the intake triage is rough.

### ▲ Complexity factor weighting and override authority

Where it lives: the `complexity_factor` table, editable in **Admin**.

Seeded flat, per the brief: new platform +15%, regulatory +15%, cross-border
+10%, vendor dependency +10%, domain unfamiliarity +10%. Additive, so three
factors give +35%. Uplift can never be negative — the API rejects it.

**To confirm:**
- The weights, once there is estimate-vs-actual history to check them against.
- **Who may override a sizing estimate.** Not yet modelled. Today anyone who can
  edit a demand item (PM, Biz Lead, admin) can change the Tier 2 grid, and the
  change is not audited. If sizing overrides need to be a controlled act, that
  is a permission plus an audit trail, and it should be specified before the
  tool is used to arbitrate real resourcing decisions.

---

## 2. Decisions made while building — flagged, not hidden

### On-hold projects do not consume capacity (default)

Committed demand counts allocations on `active` projects only. The reasoning:
paused work is not consuming effort this quarter.

The opposite argument — that the team is still nominally held — is also
reasonable, so the capacity screen has a **"Count on-hold projects as
committed"** toggle, and the API takes a `projectStatuses` parameter. Confirm
which default GFM wants; it is a one-line change in
`DEFAULT_PROJECT_STATUSES`.

### 100% utilisation is red, not amber

`>= 100%` is a breach; `>= 85%` is amber. Both thresholds are editable
assumptions. A role at exactly 100% has no capacity for anything unplanned,
which is a breach in practice.

### Pipeline demand spreads flat across an item's window

An item sized at 60 Tech BA days over six months contributes evenly to each
period it overlaps. Real delivery is front- or back-loaded by phase, so this is
approximate. Refining it means a phase-aware curve, which needs historical shape
data to justify. Flagged rather than faked.

### Capacity breaches do not block approval

Approving over the ceiling returns HTTP 409 with the breaches listed, and
proceeds only with an explicit acknowledgement flag plus a decision note. The
business sometimes decides to break the ceiling; the tool's job is to make that
a recorded decision rather than an invisible one.

### Red and Amber RAG entries require commentary

The API rejects a Red or Amber without it. An exception with no explanation is
not usable in a PSC pack.

---

## 3. Schema deviations from Section 3

Three additions, none silent.

### `DemandItem.indicative_start_date` / `indicative_end_date`

**Why:** Section 4.5 requires new demand to be tested against *remaining
capacity*, and Section 5 requires the capacity impact to be visible before a
decision. Capacity is computed per period. Without a candidate delivery window
there is no period to test in — the requirement is not implementable as
specified.

Items without a window are not dropped: they appear on the capacity screen as
**unscheduled pipeline**, and the Approve gate refuses them until a window is
set.

### `ResourceAllocation.person_id` is nullable, plus a `source` column

**Why:** Sizing is by role, not by person. On approval the conversion knows it
needs 40 Tech BA days; it does not know whose. Requiring a person would mean
either inventing an assignment or not creating the allocation — and not creating
it would mean approved demand does not move the utilisation number, which
defeats the mechanic.

Unassigned placeholders consume role capacity exactly like named allocations and
are marked in the UI as needing a name. `source` distinguishes `manual` from
`converted_demand`.

### `app_user` is separate from `person`

**Why:** Section 2 lists PSC members and an admin as users, but they are not
resourceable people and should not appear in capacity supply. Conversely not
every person in the resource pool needs a login. The two are linked by
`app_user.person_id`, which may be null.

Smaller conveniences, all optional: `project.code` (a human-readable reference),
`milestone.sort_order`, `demand_item.decision_note`, and the four configuration
tables (`assumption`, `tshirt_band`, `complexity_factor`, `rag_stream`) that
make the placeholders above editable instead of hardcoded.

---

## 4. Security posture

Adequate for a fabricated demo on an internal network. **Review before real
data.**

- Passwords: scrypt with a per-user salt, via node's crypto module. Sessions are
  random 256-bit tokens in the database with a 12-day expiry.
- The seed sets one shared demo password across all accounts. Replace it.
- No HTTPS termination in the app — expect a reverse proxy to handle it.
- No rate limiting on login. Worth adding before the app is reachable widely.
- No CSRF token: the API is token-in-header only and does not accept cookie
  auth, so a cross-site request cannot ride an ambient session.
- CSV export escapes cells that begin with `=`, `+`, `-` or `@`, so exported
  commentary cannot execute as a formula when opened in Excel.
- No audit log. Changes overwrite in place, apart from `updated_by` and
  `updated_date` on RAG entries. If evidencing who changed a budget or a sizing
  estimate matters, that needs designing in.

### The published demo

`gfm-workbench-demo/` is built from the fabricated seed and served publicly from
the repository's site. It carries no authentication by design — there is nothing
to protect, and a login screen on a dataset of invented projects would only
imply the data mattered.

Two properties keep that safe, and both should be preserved:

- `scripts/export-demo-db.mjs` refuses to package any database whose people are
  not all on `@gfm.example` addresses. Rebuilding the demo against a live
  database fails rather than publishing it.
- The demo bundles the **route** modules only. It has no network egress, no
  credentials, and no path to a real database.

If the repository ever stops being public, or if the demo is ever pointed at
something other than the seed, revisit both.

---

## 5. What to settle first

In rough order of how much they affect whether the numbers can be quoted:

1. **The effective-days figure.** Everything scales with it.
2. **Hosting and data governance sign-off.** Gates real data entry entirely.
3. **The RAG stream list.** Cheap to change, and wrong streams make the RAG
   dashboard useless from day one.
4. **Fiscal year start.** Wrong period boundaries make budget rollups wrong.
5. **On-hold treatment.** Changes the headline utilisation number.
6. **T-shirt band calibration and factor weights.** Affects intake triage
   quality, not the committed-capacity picture.
7. **Sizing override authority and audit.** Needed before the tool arbitrates
   real resourcing decisions.
