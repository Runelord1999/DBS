# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Three self-contained static HTML files — no build system, no package manager, no dependencies, no tests:

- `index.html` — a minimal landing page linking to the two dashboards.
- `agent-ops-dashboard.html` — "Agent Delivery Operations": a portfolio-level view of cost/savings and token economics across projects delivered by an agent fleet.
- `test-monitoring-dashboard.html` — "Agent Delivery Ops — Release Assurance": a per-project test-gate / CI-style release verdict console (Unit → Component → SIT → UAT → Performance → Security).

Both dashboards are illustrative/mock — all data (project names, financials, test results, agent activity) is hard-coded in JS arrays/objects at the top of each `<script>` block. There is no backend, no API calls, and no persistence; everything is computed client-side from that mock data.

## Working with this codebase

There is no build, lint, or test command — each HTML file is fully self-contained (inline `<style>` and `<script>`, no external requests). "Running" the app means opening the file directly in a browser, or serving the directory statically:

```
python3 -m http.server 8000   # then visit http://localhost:8000/index.html
```

After editing a dashboard, open it in a browser and click through its tabs/filters/drawers to check for JS errors (there's no test suite to catch regressions).

## Shared conventions across both dashboard files

The two dashboards were built as a matched pair and duplicate a lot of infrastructure rather than sharing a common file. When changing one of the items below, check whether the same change is needed in the other file:

- **Color palette / CSS custom properties** — `:root` variables (`--ground`, `--panel`, `--ink`, `--pass`, `--fail`, `--warn`, `--agent`, `--gold`, etc.) are defined identically in both files' `<style>` blocks. Keep them in sync if the theme changes.
- **Tooltip engine** — an IIFE near the top of each `<script>` that reads `data-tip` attributes on hover and positions a floating box; copy-pasted verbatim in both files.
- **`$` / `esc` helpers** — `$ = (s, r=document) => r.querySelector(s)` and an `esc()` HTML-escaper. Always pass untrusted/dynamic text through `esc()` before interpolating into an innerHTML template string — nearly all rendering in these files works by building HTML strings and assigning `innerHTML`, so unescaped interpolation is an XSS risk.
- **Live clock** — `tick()`/`setInterval` in the sidebar, purely cosmetic.

## Rendering architecture (both dashboards)

Both files follow the same pattern: a single mutable `state` object, a set of `render*`/`pane*` functions that return HTML strings, and a `PANES` lookup object mapping a tab key to its render function. There is no framework — no virtual DOM, no component tree. A state change is followed by calling the relevant `render`/`refresh` function, which regenerates the affected DOM subtree wholesale via `innerHTML`.

All interactivity is handled through **one delegated click listener on `document`**, dispatching on `data-*` attributes (`data-p`, `data-gate`, `data-sort`, `data-agent`, `data-fail`, `data-suite`, `data-viewproject`, etc.) rather than per-element listeners. When adding a new clickable element, add its `data-*` attribute to the markup and a corresponding branch in that listener, following the existing `if (x) { ...; return; }` chain.

A slide-out "drawer" panel (`openDrawer`/`closeDrawer`) is used in both files to show entity detail (a project, an agent, a failure) without navigating away from the current tab.

### `agent-ops-dashboard.html` specifics

- `ALL_P` is the master list of projects (code, name, phase, team/token/cost inputs). `P` is the currently filtered subset (by portfolio/segment selector).
- `CTRL` holds the live "assumptions" state (rate, discount, team multiplier, token multiplier) driven by the sidebar sliders; `DEF`/`DEFAULTS` hold the baseline values used to compute the "vs base case" delta shown in the UI.
- `recompute()` derives all per-project financials (`spend`, `savings`, `savePct`, etc.) and portfolio totals (`T`) from `ALL_P`/`P` and `CTRL` — call it (via `refresh()`) any time `P` or `CTRL` changes.
- `PANES = {portfolio, savings, tokens, fleet, quality}` — the five tabs, each a function producing that tab's HTML from `P`/`T`.
- `FLEET` and `SWARM` are separate hard-coded mock structures for the agent-fleet and per-project agent-swarm views; they are not derived from `ALL_P`.

### `test-monitoring-dashboard.html` specifics

- `GATE_META` defines the fixed six-gate taxonomy (Unit → Component → SIT → UAT → Performance → Security) that every project ladder displays in this order; a gate a project hasn't reached yet defaults to `status:"pending"` via the `gates()` helper.
- `PROJECTS` is keyed by project code (e.g. `"AOE-OPT"`) and holds each project's gates, test suites, service latency data, and failure/triage items. `PROJECT_ORDER` fixes the display order.
- `state.view` toggles between `"portfolio"` (the all-projects summary table) and `"project"` (a single project's full console with tabs `PANES = {overview, suites, latency, failures, agents}`); `state.gate` filters every pane in project view down to one test gate.
- **Cross-file data consistency**: several fields in `PROJECTS[code].qc` (`qcPass`, `override`, `escape`) and `phase`/`pct` are intentionally kept numerically consistent with the corresponding project's entry in `agent-ops-dashboard.html`'s `ALL_P` (the code comments call this out) — the release-assurance console's "quality roll-up" is meant to be exactly what the portfolio console reports on its Output Quality tab. If you change one project's quality numbers, update the same project in the other file.
