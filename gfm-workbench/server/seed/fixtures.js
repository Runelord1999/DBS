/**
 * Fabricated content pools for the demo seed.
 *
 * EVERY string in this file is invented. Nothing here is an anonymised or
 * lightly-disguised real project, sponsor, vendor or person (Build Brief
 * Section 11). The names are deliberately generic-sounding so that no reader
 * can mistake one for a real book of work, and the numbers are arbitrary.
 */

export const FIRST_NAMES = [
  'Amara', 'Beatrix', 'Callum', 'Delphine', 'Emeka', 'Farrah', 'Gideon', 'Halima',
  'Idris', 'Juniper', 'Kwame', 'Lorenza', 'Mattias', 'Nadira', 'Osric', 'Priya',
  'Quentin', 'Rosalind', 'Soren', 'Tamsin', 'Ulrike', 'Vikram', 'Wilhelmina', 'Xiomara',
  'Yusuf', 'Zenobia', 'Anouk', 'Bartholomew', 'Cressida', 'Dashiell', 'Elowen', 'Fionnuala',
  'Gustavo', 'Henrietta', 'Ignatius', 'Jocasta', 'Konstantin', 'Leocadia', 'Marisol',
  'Nikolai', 'Ottoline', 'Perpetua', 'Rafferty', 'Saoirse', 'Thaddeus', 'Ursula',
  'Valentina', 'Wendeline', 'Yolanda', 'Zephyrine', 'Caspian', 'Isolde', 'Marnie',
  'Oberon', 'Sabelle', 'Torquil', 'Verity', 'Wystan', 'Anselm', 'Brigid',
];

export const LAST_NAMES = [
  'Aldergate', 'Brackwater', 'Castellane', 'Drummondsley', 'Eastmarch', 'Fenwicke',
  'Grimsdale', 'Hollowbrook', 'Innesford', 'Jarrowmere', 'Kirkbride', 'Lockhaven',
  'Marchetti', 'Northwood', 'Ollivander', 'Pemberton', 'Quillon', 'Ravensworth',
  'Stonebridge', 'Thornbury', 'Underhill', 'Vanterpool', 'Westerling', 'Yarrowfield',
  'Ashcombe', 'Blythewood', 'Coldstream', 'Danforth', 'Elmsworth', 'Fairholme',
  'Galbraith', 'Havelock', 'Ilderton', 'Jessamine', 'Kestrelmoor', 'Langmere',
  'Mossgrave', 'Netherfield', 'Oakhurst', 'Pinehollow', 'Quarrington', 'Redmayne',
  'Sallowfield', 'Tanglewood', 'Uppingham', 'Vexley', 'Wharton', 'Yewbank',
];

/** Fictional programme codenames — none of these correspond to anything real. */
export const PROJECT_CODENAMES = [
  'Alderfall', 'Bellwether', 'Cinderpost', 'Dovetail', 'Everlode', 'Foxglove',
  'Glasshouse', 'Halyard', 'Ironwood', 'Jackdaw', 'Kingfisher', 'Lanternfly',
  'Millrace', 'Nightjar', 'Overtone', 'Pennywhistle', 'Quicksilver', 'Rookery',
  'Saltmarsh', 'Thistledown', 'Umbra', 'Verdigris', 'Wayfarer', 'Xenolith',
  'Yardarm', 'Zephyr', 'Ambergris', 'Bittern', 'Coppice', 'Driftwood',
  'Ellipsis', 'Fathom', 'Gantry', 'Harbinger', 'Inglenook', 'Junco',
  'Keelson', 'Limestone', 'Marlinspike', 'Nettlebed', 'Orrery', 'Palisade',
  'Quillfeather', 'Ratchet', 'Sextant', 'Tallowmere', 'Ullage', 'Vellum',
  'Windlass', 'Yaffle', 'Zircon', 'Anvilhead', 'Brindle', 'Cormorant',
];

/** Generic capability descriptions — invented, not a real GFM roadmap. */
export const PROJECT_THEMES = [
  { name: 'FX Options Confirmation Rework', desc: 'Replace the manual confirmation path for vanilla and exotic FX options with a straight-through flow.' },
  { name: 'Rates Booking Model Uplift', desc: 'Migrate the interest rate swap booking model onto the strategic trade store.' },
  { name: 'Credit Limits Real-Time Check', desc: 'Move pre-trade credit limit checking from end-of-day batch to real-time.' },
  { name: 'Client Onboarding Digitisation', desc: 'Digitise the institutional client onboarding pack and approval routing.' },
  { name: 'Regulatory Trade Reporting Remediation', desc: 'Close reporting gaps identified in the annual controls review.' },
  { name: 'Commodities Pricing Engine Refresh', desc: 'Replace the legacy commodities pricing library with the vendor-supported release.' },
  { name: 'Structured Products Lifecycle Automation', desc: 'Automate coupon, barrier and knock-out event processing for structured notes.' },
  { name: 'Collateral Optimisation Phase 2', desc: 'Extend collateral allocation optimisation to the remaining legal entities.' },
  { name: 'e-Trading Latency Reduction', desc: 'Reduce quote-to-order latency on the electronic pricing tier.' },
  { name: 'Market Data Cost Rationalisation', desc: 'Consolidate overlapping market data feeds and retire duplicated entitlements.' },
  { name: 'Settlement Exceptions Workbench', desc: 'Give operations a single queue for settlement breaks across products.' },
  { name: 'Cross-Border Payments Screening', desc: 'Uplift sanctions screening coverage for cross-border payment instructions.' },
  { name: 'Trade Surveillance Rule Expansion', desc: 'Add new anomaly detection rules to the surveillance platform.' },
  { name: 'Counterparty Reference Data Cleanup', desc: 'Remediate duplicate and stale counterparty records in the golden source.' },
  { name: 'Repo Desk Position Keeping', desc: 'Replace spreadsheet-based position keeping on the repo desk.' },
  { name: 'Client Reporting Portal Refresh', desc: 'Rebuild the client-facing reporting portal on the current web platform.' },
  { name: 'Risk Aggregation Performance', desc: 'Cut the overnight risk aggregation window to fit the reporting deadline.' },
  { name: 'Vendor Platform Version Upgrade', desc: 'Move off an unsupported vendor release before end of support.' },
  { name: 'Derivatives Margin Calculation Uplift', desc: 'Align margin calculation with the revised methodology.' },
  { name: 'Sales Coverage Analytics', desc: 'Give the sales desk a consolidated view of client revenue and coverage.' },
  { name: 'Post-Trade Allocation Automation', desc: 'Automate block trade allocation for asset manager clients.' },
  { name: 'Liquidity Stress Testing Enhancement', desc: 'Extend stress scenarios to cover additional funding assumptions.' },
  { name: 'Digital Asset Custody Pilot', desc: 'Stand up a limited pilot for digital asset custody workflows.' },
  { name: 'Trade Capture Resilience', desc: 'Remove single points of failure in the trade capture pipeline.' },
  { name: 'Legacy Platform Decommissioning', desc: 'Retire an end-of-life platform and migrate residual users.' },
  { name: 'Fixed Income Pricing Transparency', desc: 'Publish consistent pricing rationale to sales and clients.' },
  { name: 'Front Office Controls Dashboard', desc: 'Consolidate front office control breaches into one view.' },
  { name: 'Client Limit Monitoring Alerts', desc: 'Alert coverage teams before a client breaches an agreed limit.' },
  { name: 'Interest Rate Benchmark Migration', desc: 'Complete migration of remaining contracts to the replacement benchmark.' },
  { name: 'Order Management Workflow Simplification', desc: 'Reduce the number of manual touch points in the order workflow.' },
];

export const SPONSORS = [
  'Head of Markets Technology', 'Head of GFM Operations', 'Head of Rates Trading',
  'Head of FX Sales', 'Chief Operating Officer, GFM', 'Head of Credit Trading',
  'Head of Regulatory Change', 'Head of Client Coverage', 'Head of Risk Technology',
  'Head of Commodities', 'Head of Digital Channels', 'Head of Market Data',
];

/** Fabricated RAG commentary, keyed by stream and status. */
export const RAG_COMMENTARY = {
  tech_delivery: {
    Red: [
      'Two of four build squads are blocked on an unresolved environment dependency; no code has merged in three weeks.',
      'Integration testing has surfaced a design flaw in the event sequencing that needs a partial rebuild.',
      'The strategic component the design assumed will not be available this fiscal year. Re-planning underway.',
    ],
    Amber: [
      'Build is tracking two sprints behind plan. Recovery depends on the contractor onboarding completing this month.',
      'Non-functional testing has not started; the performance environment is still being provisioned.',
      'Scope for phase 2 is still moving, which is holding up the detailed build estimate.',
    ],
    Green: [
      'Build tracking to plan; all committed sprint scope delivered in the last two cycles.',
      'Design signed off and the first increment is in system test on schedule.',
      'No open blockers; the team is on the critical path with contingency intact.',
    ],
  },
  business_requirements: {
    Red: [
      'Requirements remain unsigned eight weeks after the agreed date; three desks disagree on the target operating model.',
      'A late change to the scope has invalidated the approved specification and re-analysis has not been scheduled.',
    ],
    Amber: [
      'Requirements are 80% signed off; the reporting section is still with the business for review.',
      'Two open questions on the exception handling flow need a decision before build can finalise.',
    ],
    Green: [
      'All requirements signed off and baselined; change control is operating normally.',
      'Business analysis complete with no open items.',
    ],
  },
  uat: {
    Red: [
      'UAT is suspended: the test environment has been unstable for nine working days and defects cannot be reproduced.',
      'Business testers have not been released from BAU duties, so UAT has not started against a plan that assumed they would be.',
    ],
    Amber: [
      'UAT is running but the defect close rate is behind the burn-down needed to hit the exit date.',
      'Two severity-2 defects remain open with fixes expected in the next drop.',
    ],
    Green: [
      'UAT complete with all exit criteria met; sign-off obtained from all participating desks.',
      'UAT tracking ahead of plan; no severity-1 or severity-2 defects outstanding.',
    ],
  },
  vendor: {
    Red: [
      'The vendor has formally notified a four-month slip on the release this project depends on. Mitigation options are being costed.',
      'Contract negotiation has stalled over liability terms; no statement of work is signed and the team cannot start.',
    ],
    Amber: [
      'Vendor resourcing has changed twice this quarter; delivery dates are being re-confirmed.',
      'The vendor patch that fixes the outstanding defect is scheduled but not yet released.',
    ],
    Green: [
      'Vendor deliverables received on schedule and accepted.',
      'Vendor engagement stable; no commercial or delivery issues open.',
    ],
  },
  budget: {
    Red: [
      'Forecast now exceeds approved budget by more than 20%; a supplementary funding request is required this quarter.',
      'The project is proceeding against unbudgeted demand with no approved funding line.',
    ],
    Amber: [
      'Forecast is running ahead of budget, driven by contractor extension costs. Mitigation under review.',
      'Funding for the second phase is pending approval; work is committed only to the end of the current quarter.',
    ],
    Green: [
      'Spend tracking within approved budget with the contingency untouched.',
      'Forecast to complete is within tolerance of the approved envelope.',
    ],
  },
  resourcing: {
    Red: [
      'The project is short two Tech BAs against plan and the shortfall has already moved the critical path.',
      'Key technical lead has rolled off with no identified replacement; knowledge transfer did not complete.',
    ],
    Amber: [
      'Tester availability drops next quarter as people are pulled onto the regulatory programme.',
      'Contractor onboarding is taking longer than assumed, compressing the build window.',
    ],
    Green: [
      'Team is fully resourced against plan for the current and next quarter.',
      'All named roles filled with no planned roll-offs in the delivery window.',
    ],
  },
  regulatory: {
    Red: [
      'The delivery date no longer meets the regulatory deadline; an extension request or scope reduction is needed.',
      'A control gap identified in review has not been remediated and remains open past its due date.',
    ],
    Amber: [
      'Regulatory interpretation is still being confirmed with compliance, which affects the reporting scope.',
      'Evidence pack for the attestation is behind schedule but expected to complete before the deadline.',
    ],
    Green: [
      'On track against the regulatory milestone with evidence collection underway.',
      'Compliance has reviewed and confirmed the approach; no open observations.',
    ],
  },
};

export const MILESTONE_TEMPLATES = [
  'Requirements sign-off', 'Solution design approved', 'Build complete — increment 1',
  'Build complete — increment 2', 'System integration test complete', 'UAT entry',
  'UAT exit / business sign-off', 'Production deployment', 'Warranty exit',
  'Vendor contract signed', 'Regulatory evidence pack submitted', 'Pilot go-live',
];

/** Fabricated demand items covering every state in the Section 5 workflow. */
export const DEMAND_ITEMS = [
  {
    title: 'Add two new anomaly detection rules to surveillance',
    description: 'Compliance has asked for spoofing and layering coverage on two additional products.',
    source: 'new regulatory', status: 'Triage', tshirt_size: 'M',
    window: [2, 8],
    factors: ['regulatory', 'domain_unfamiliarity'],
    sizing: {
      'Tech BA': { Discovery: 12, Build: 4, Test: 3, Deploy: 1 },
      'Biz Lead': { Discovery: 8, Build: 2, Test: 4, Deploy: 1 },
      Developer: { Discovery: 3, Build: 22, Test: 6, Deploy: 3 },
      Tester: { Discovery: 1, Build: 2, Test: 14, Deploy: 2 },
      'Tech Lead': { Discovery: 4, Build: 6, Test: 2, Deploy: 2 },
      PM: { Discovery: 3, Build: 5, Test: 3, Deploy: 2 },
    },
  },
  {
    title: 'Client-requested extension to the settlement exceptions queue',
    description: 'Two coverage teams want their own filtered view and a bulk-action capability.',
    source: 'BAU enhancement', status: 'Triage', tshirt_size: 'S',
    window: [1, 4],
    factors: [],
    sizing: {
      'Tech BA': { Discovery: 3, Build: 1, Test: 1, Deploy: 0 },
      Developer: { Discovery: 1, Build: 7, Test: 2, Deploy: 1 },
      Tester: { Discovery: 0, Build: 0, Test: 4, Deploy: 1 },
      PM: { Discovery: 1, Build: 1, Test: 1, Deploy: 1 },
    },
  },
  {
    title: 'Real-time margin call notifications for institutional clients',
    description: 'Business request to push margin calls to clients rather than waiting for the daily file.',
    source: 'business request', status: 'Triage', tshirt_size: 'L',
    window: [3, 12],
    factors: ['new_platform', 'cross_border', 'vendor_dependency'],
    sizing: {
      'Tech BA': { Discovery: 20, Build: 8, Test: 6, Deploy: 2 },
      'Biz Lead': { Discovery: 15, Build: 5, Test: 8, Deploy: 2 },
      Developer: { Discovery: 6, Build: 55, Test: 14, Deploy: 6 },
      Tester: { Discovery: 2, Build: 4, Test: 30, Deploy: 4 },
      'Tech Lead': { Discovery: 10, Build: 18, Test: 6, Deploy: 4 },
      PM: { Discovery: 6, Build: 12, Test: 8, Deploy: 4 },
    },
  },
  {
    title: 'Consolidate duplicate counterparty records flagged by data quality',
    description: 'Data quality reporting has surfaced roughly 4,000 suspected duplicates.',
    source: 'BAU enhancement', status: 'T-Shirt Sized', tshirt_size: 'M',
    window: [4, 9], factors: [], sizing: null,
  },
  {
    title: 'New jurisdiction reporting obligation — phase 1 assessment',
    description: 'A new reporting obligation takes effect next fiscal year; scope not yet understood.',
    source: 'new regulatory', status: 'T-Shirt Sized', tshirt_size: 'XL',
    window: [5, 18], factors: ['regulatory', 'cross_border'], sizing: null,
  },
  {
    title: 'Sales desk wants a revenue attribution breakdown by client tier',
    description: 'Requested verbally at the quarterly business review; not yet specified.',
    source: 'business request', status: 'New', tshirt_size: null,
    window: null, factors: [], sizing: null,
  },
  {
    title: 'Retire the spreadsheet used for repo desk position reconciliation',
    description: 'Operational risk raised this as a manual control dependency.',
    source: 'other', status: 'New', tshirt_size: null,
    window: null, factors: [], sizing: null,
  },
  {
    title: 'Add PDF export to the client reporting portal',
    description: 'Several clients have asked for a printable version of the daily report.',
    source: 'BAU enhancement', status: 'New', tshirt_size: null,
    window: null, factors: [], sizing: null,
  },
  {
    title: 'Extend collateral optimisation to two further legal entities',
    description: 'Follow-on scope from the phase 2 delivery.',
    source: 'business request', status: 'Deferred', tshirt_size: 'L',
    window: [8, 16], factors: ['cross_border'],
    decision_note: 'Deferred to next fiscal year — no Tech BA or Developer capacity in the requested window, and the phase 2 benefits case has not been realised yet.',
    sizing: {
      'Tech BA': { Discovery: 14, Build: 6, Test: 4, Deploy: 2 },
      Developer: { Discovery: 4, Build: 40, Test: 10, Deploy: 4 },
      Tester: { Discovery: 1, Build: 3, Test: 20, Deploy: 3 },
      PM: { Discovery: 4, Build: 8, Test: 5, Deploy: 3 },
    },
  },
  {
    title: 'Rebuild the internal team dashboard in a new front-end framework',
    description: 'Proposal to modernise an internal tool that currently works.',
    source: 'other', status: 'Rejected', tshirt_size: 'M',
    window: [2, 7], factors: ['new_platform'],
    decision_note: 'Rejected — no business benefit identified and the existing tool is not a control or support risk. Revisit only if the platform reaches end of support.',
    sizing: null,
  },
  {
    title: 'Ad-hoc pricing query tool for the structuring desk',
    description: 'Structuring desk wants self-service access to historical pricing runs.',
    source: 'business request', status: 'Rejected', tshirt_size: 'S',
    window: null, factors: [],
    decision_note: 'Rejected in triage — the existing reporting suite already covers this once the desk is trained on it.',
    sizing: null,
  },
  {
    title: 'Automate the monthly regulatory attestation evidence pack',
    description: 'Currently assembled by hand over three days each month.',
    source: 'BAU enhancement', status: 'Deferred', tshirt_size: 'M',
    window: [6, 11], factors: ['regulatory'],
    decision_note: 'Deferred one quarter — worth doing, but Tech BA capacity is already over the ceiling in the requested window.',
    sizing: {
      'Tech BA': { Discovery: 8, Build: 3, Test: 2, Deploy: 1 },
      Developer: { Discovery: 2, Build: 18, Test: 5, Deploy: 2 },
      Tester: { Discovery: 0, Build: 1, Test: 9, Deploy: 1 },
      PM: { Discovery: 2, Build: 3, Test: 2, Deploy: 1 },
    },
  },
];
