# Working notes for this repository

## Mock data: people's names are Japanese

Every human name in mock or demo data — traders, reviewers, supervisors,
approvers, staff, client contacts, example data owners — must be a Japanese
name. This applies to every dashboard, prototype and handover document in this
repository, and to anything new added to it.

- Romanised (Hepburn, no macrons), given name first: `Ryota Matsumoto`,
  `M. Sakamoto`. The dashboards derive initials and surname-only labels from
  that order.
- Full names are unique within a dataset. Where a screen shows only a
  surname, or an initial and surname, keep given and family names unique too,
  so the short label still identifies one person.
- Fictional only: no names of well-known real people.
- Change names, never IDs. Data generation must not depend on a name, so a
  rename leaves every trade, alert and figure unchanged — check that it does.
  Where a generator combines name pools at random (the Delivery Workbench
  seed), swap the pools position for position so it draws the same sequence.
- Where a page saves seeded records in the browser (Settlement Risk), rename
  the saved copies on load as well, rather than changing the storage key and
  discarding what the viewer entered.
- Company, counterparty and system names are not people's names and are not
  covered by this rule.

## Tables and long lists are paged by default

Assume every table, blotter or list will one day hold hundreds of rows, and
build paging in from the start. This applies to every site in this repository
and to anything new added to it.

- Tables get pagination: Prev and Next, numbered pages, "Showing 1–25 of
  3,724", and a rows-per-page choice of 10 / 25 / 50 / 100 / 250. Blotters
  start at 50 rows a page, other tables at 25.
- Card grids and long lists inside side panels get lazy loading: a first
  batch, the next batch as the reader scrolls near the end, and a "Show all N"
  button for anyone not using a mouse.
- Filter and sort the full set first, then cut it to a page. Counts, totals,
  highlights and exports always describe every matching row, never only the
  visible ones.
- A different filter, search or sort returns to page 1. Turning a page,
  approving a row or switching a measure does not.
- A table that fits inside its default page shows no pager.
- Never cut a list at a fixed count. The only exceptions are deliberate
  "top N" rankings and printable reports, and those must say they are top N.
- A table inside a drawer pages by redrawing only itself. Redrawing the drawer
  throws away what the reader was doing in it, such as a half-written note.
- Reference implementations: `pager()`, `localPaged()` and `lazyGrid()` in
  `trade-surveillance-dashboard.html`; `pageOf()` and `pagerBar()` in
  `settlement-risk-dashboard.html`. Settlement Risk's built-in tests check
  that every row is reachable exactly once.
