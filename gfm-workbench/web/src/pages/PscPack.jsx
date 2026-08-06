import { useState } from 'react';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Loading, Select, StatTile, StatusChip,
} from '../components/ui.jsx';
import { useApi, query } from '../lib/useApi.js';
import { downloadCsv } from '../lib/api.js';
import { date, dateShort, days, money, pct } from '../lib/format.js';

/**
 * PSC Pack (Section 7.8) — a steering-committee-shaped read of the portfolio,
 * laid out to be printed or exported rather than clicked through.
 */
export default function PscPack() {
  const [scope, setScope] = useState('psc');
  const { data, error, loading } = useApi(`/portfolio/psc-pack${query({ scope })}`, [scope]);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const { health, budget, exceptions, milestones, capacity, demand, currency, projects } = data;
  const committedBreaches = capacity.breaches.filter((b) => b.committedOnly);

  return (
    <div className="space-y-4">
      <PageHeader
        title="PSC pack"
        description={`Generated ${date(data.generatedAt.slice(0, 10))} · ${
          scope === 'psc' ? 'PSC-governed projects only' : 'the whole portfolio'}`}
        actions={
          <>
            <Field label="Scope" className="w-48">
              <Select
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'psc', label: 'PSC-governed only' },
                  { value: 'all', label: 'Whole portfolio' },
                ]}
              />
            </Field>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn btn-sm"
              onClick={() => downloadCsv('/export/projects.csv', 'gfm-psc-projects.csv')}>
              Export CSV
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Projects in scope" value={health.total}
          hint={`${health.red} Red · ${health.amber} Amber · ${health.green} Green`} />
        <StatTile label="Approved budget" value={money(budget.budgeted, currency)} />
        <StatTile
          label="Forecast"
          value={money(budget.forecast, currency)}
          status={budget.variance > 0 ? 'red' : 'green'}
          hint={`${budget.variance > 0 ? 'Over' : 'Under'} by ${money(Math.abs(budget.variance), currency)}`}
        />
        <StatTile
          label="Capacity breaches"
          value={committedBreaches.length}
          status={committedBreaches.length ? 'red' : 'green'}
          hint="Role/quarter combinations already over 100% on approved work"
        />
      </div>

      <Card
        title="1. Capacity — the constraint"
        subtitle="Committed demand against the team's effective delivery capacity, by role and quarter."
      >
        {committedBreaches.length === 0 ? (
          <p className="text-[0.8125rem] secondary">
            No role is over its ceiling on approved work in the reporting window.
          </p>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {committedBreaches.map((b) => (
              <li key={`${b.role}-${b.periodKey}`} className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                <StatusChip status="red" label="Over" />
                <span className="font-semibold">{b.role}</span>
                <span className="secondary">
                  {pct(b.utilizationPct)} in {b.periodLabel} — {days(Math.abs(b.overDays))} person-days
                  beyond what the team has.
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Role</th>
                <th className="num">People</th>
                {capacity.periods.map((p) => <th key={p.key} className="num">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {capacity.roles.map((role) => (
                <tr key={role.role}>
                  <td className="font-medium">{role.role}</td>
                  <td className="num secondary">{role.headcount}</td>
                  {role.periods.map((cell) => (
                    <td key={cell.key} className="num font-semibold" style={{
                      color: cell.status === 'red' ? 'var(--status-critical)'
                        : cell.status === 'amber' ? 'var(--status-warning)' : undefined,
                    }}>
                      {pct(cell.committedUtilizationPct)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mt-2">
          Utilisation on approved work only. Capacity assumes{' '}
          {capacity.assumptions.effectiveDaysPerYear} effective delivery days per person per year.
        </p>
      </Card>

      <Card title="2. Exceptions — Reds and Ambers" subtitle="Every open exception with its commentary.">
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '5rem' }}>RAG</th>
                <th style={{ width: '15rem' }}>Project</th>
                <th style={{ width: '9rem' }}>Stream</th>
                <th>Commentary</th>
                <th style={{ width: '9rem' }}>PM</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id}>
                  <td><StatusChip status={e.status} /></td>
                  <td className="font-medium">{e.project_name}</td>
                  <td className="secondary">{e.stream_label || e.stream}</td>
                  <td className="secondary">{e.commentary}</td>
                  <td className="secondary text-xs">{e.pm_owner_name || '—'}</td>
                </tr>
              ))}
              {exceptions.length === 0 && (
                <tr><td colSpan={5} className="muted text-center py-6">No open exceptions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="3. Milestones — delayed or due within 90 days"
        subtitle="What the committee needs to know about the schedule."
      >
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '16rem' }}>Project</th>
                <th>Milestone</th>
                <th style={{ width: '8rem' }}>Planned</th>
                <th style={{ width: '8rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.project_name}</td>
                  <td className="secondary">{m.name}</td>
                  <td className="secondary">{dateShort(m.planned_date)}</td>
                  <td>
                    {m.status === 'delayed'
                      ? <StatusChip status="red" label="Delayed" />
                      : <span className="secondary capitalize">{m.status}</span>}
                  </td>
                </tr>
              ))}
              {milestones.length === 0 && (
                <tr><td colSpan={4} className="muted text-center py-6">Nothing due or delayed.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="4. Demand awaiting decision"
        subtitle="What is queued behind the current book of work."
      >
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: '9rem' }}>Source</th>
                <th style={{ width: '6rem' }}>Status</th>
                <th style={{ width: '5rem' }}>Size</th>
                <th className="num" style={{ width: '8rem' }}>Person-days</th>
                <th style={{ width: '11rem' }}>Indicative window</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.title}</td>
                  <td className="secondary capitalize">{d.source}</td>
                  <td className="secondary">{d.status}</td>
                  <td className="secondary">{d.tshirt_size || '—'}</td>
                  <td className="num">
                    {d.sizing_summary.tier2Complete
                      ? days(d.sizing_summary.adjustedDays)
                      : <span className="muted">not sized</span>}
                  </td>
                  <td className="secondary text-xs">
                    {d.scheduled
                      ? `${dateShort(d.indicative_start_date)} → ${dateShort(d.indicative_end_date)}`
                      : '—'}
                  </td>
                </tr>
              ))}
              {demand.length === 0 && (
                <tr><td colSpan={6} className="muted text-center py-6">Nothing in the pipeline.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="5. Projects in scope" bodyClass="">
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '5rem' }}>Code</th>
                <th>Project</th>
                <th style={{ width: '5rem' }}>RAG</th>
                <th style={{ width: '7rem' }}>Status</th>
                <th style={{ width: '10rem' }}>Sponsor</th>
                <th className="num" style={{ width: '8rem' }}>Budget</th>
                <th className="num" style={{ width: '8rem' }}>Forecast</th>
                <th className="num" style={{ width: '7rem' }}>Target end</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.code}</td>
                  <td className="font-medium">{p.name}</td>
                  <td><StatusChip status={p.worst_rag} /></td>
                  <td className="secondary capitalize">{p.status}</td>
                  <td className="secondary text-xs">{p.sponsor || '—'}</td>
                  <td className="num">{money(p.budgeted_amount, currency)}</td>
                  <td className="num" style={{
                    color: p.budget_variance > 0 ? 'var(--status-critical)' : undefined,
                  }}>
                    {money(p.forecast_spend, currency)}
                  </td>
                  <td className="num secondary">{dateShort(p.target_end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
