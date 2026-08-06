import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Loading, StatTile, StatusChip,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { days, money, pct } from '../lib/format.js';

/** Workbench Home — the exec summary strip (Section 7.1). */
export default function Home() {
  const { data, error, loading } = useApi('/portfolio/summary');
  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const { projects, rag, budget, demand, capacity } = data;
  const worst = capacity.worst;
  const breached = capacity.breachCount > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workbench"
        description="Where the book of work stands today: portfolio health, the capacity ceiling, and what is queued behind it."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Tightest role"
          value={worst ? pct(worst.committedUtilizationPct) : '—'}
          hint={worst
            ? `${worst.role} in ${worst.periodLabel}, on approved work alone`
            : 'No allocations recorded yet'}
          status={worst?.status}
          emphasis
        />
        <StatTile
          label="Active projects"
          value={projects.byStatus.active ?? 0}
          hint={`${projects.byTier['PSC-governed'] ?? 0} PSC-governed · ${projects.total} in total incl. closed`}
        />
        <StatTile
          label="Projects with a Red"
          value={rag.projectsWithRed}
          status={rag.projectsWithRed > 0 ? 'red' : 'green'}
          hint={`${rag.counts.Red ?? 0} Red and ${rag.counts.Amber ?? 0} Amber entries across all streams`}
        />
        <StatTile
          label="Demand in the pipeline"
          value={demand.inPipeline}
          hint={`${days(demand.pipelineDays)} sized person-days · ${demand.unsized} not yet sized`}
        />
      </div>

      {breached && (
        <Card
          title="The team is over its capacity ceiling"
          subtitle="On approved work alone — before any of the pipeline is taken on."
        >
          <ul className="space-y-1.5">
            {capacity.breaches.filter((b) => b.committedOnly).map((b) => (
              <li key={`${b.role}-${b.periodKey}`} className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                <StatusChip status="red" label="Over" />
                <span className="font-semibold">{b.role}</span>
                <span className="secondary">
                  at {pct(b.utilizationPct)} in {b.periodLabel},
                  {' '}{days(Math.abs(b.overDays))} person-days short.
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[0.8125rem] secondary mt-3">
            New demand cannot be absorbed in these roles without cutting something,
            moving a date, or adding headcount.{' '}
            <Link to="/capacity" className="font-semibold" style={{ color: 'var(--series-1)' }}>
              Open the capacity view →
            </Link>
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Portfolio" subtitle="Live book of work by governance tier and funding.">
          <Breakdown
            rows={[
              ['Active', projects.byStatus.active ?? 0],
              ['On hold', projects.byStatus['on-hold'] ?? 0],
              ['Closed', projects.byStatus.closed ?? 0],
            ]}
          />
          <hr className="my-3" style={{ borderColor: 'var(--gridline)' }} />
          <Breakdown
            rows={[
              ['PSC-governed', projects.byTier['PSC-governed'] ?? 0],
              ['Non-PSC', projects.byTier['Non-PSC'] ?? 0],
            ]}
          />
          <hr className="my-3" style={{ borderColor: 'var(--gridline)' }} />
          <Breakdown
            rows={[
              ['Budgeted', projects.byBudgetType.budgeted ?? 0],
              ['Unbudgeted', projects.byBudgetType.unbudgeted ?? 0],
              ['Enhancement demand', projects.byBudgetType['enhancement demand'] ?? 0],
            ]}
          />
          <Link to="/portfolio" className="btn btn-sm mt-3">Open portfolio grid</Link>
        </Card>

        <Card title="Budget" subtitle="Across all open projects.">
          <Breakdown
            rows={[
              ['Approved budget', money(budget.budgeted, budget.currency)],
              ['Actual to date', money(budget.actual, budget.currency)],
              ['Forecast', money(budget.forecast, budget.currency)],
            ]}
          />
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--gridline)' }}>
            <div className="flex items-center justify-between text-[0.8125rem]">
              <span className="secondary">Forecast vs budget</span>
              <span
                className="num font-semibold"
                style={{
                  color: budget.variance > 0 ? 'var(--status-critical)' : 'var(--success-text)',
                }}
              >
                {budget.variance > 0 ? '+' : ''}{money(budget.variance, budget.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[0.8125rem] mt-1">
              <span className="secondary">Unbudgeted / pending exposure</span>
              <span className="num font-semibold">
                {money(budget.unbudgetedExposure, budget.currency)}
              </span>
            </div>
          </div>
          <Link to="/budget" className="btn btn-sm mt-3">Open budget tracker</Link>
        </Card>

        <Card title="Demand intake" subtitle="Everything waiting on a decision.">
          <Breakdown
            rows={Object.entries(demand.byStatus).map(([status, n]) => [status, n])}
          />
          {demand.unscheduled > 0 && (
            <p className="text-xs muted mt-3">
              {demand.unscheduled} sized item(s) have no indicative window, so their
              capacity impact cannot be placed in a period yet.
            </p>
          )}
          <Link to="/demand" className="btn btn-sm mt-3">Open intake queue</Link>
        </Card>
      </div>
    </div>
  );
}

function Breakdown({ rows }) {
  return (
    <dl className="space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
          {/* first-letter only: title-casing turns "Approved budget" into
              "Approved Budget" and "T-Shirt Sized" into nonsense. */}
          <dt className="secondary first-letter:uppercase">{label}</dt>
          <dd className="num font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
