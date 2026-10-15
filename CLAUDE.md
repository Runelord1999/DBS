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
