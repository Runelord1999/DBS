# Working notes for this repository

## Mock data: people's names are Japanese

Every human name in mock or demo data — traders, reviewers, supervisors,
approvers, staff, client contacts, example data owners — must be a Japanese
name. This applies to every dashboard, prototype and handover document in this
repository, and to anything new added to it.

- Romanised (Hepburn, no macrons), given name first: `Ryota Matsumoto`,
  `M. Sakamoto`. The dashboards derive initials and surname-only labels from
  that order.
- Within one dataset, keep given names and family names unique, so a
  surname-only or initial-and-surname label still identifies one person.
- Fictional only: no names of well-known real people.
- Change names, never IDs. Data generation must not depend on a name, so a
  rename leaves every trade, alert and figure unchanged — check that it does.
- Company, counterparty and system names are not people's names and are not
  covered by this rule.
