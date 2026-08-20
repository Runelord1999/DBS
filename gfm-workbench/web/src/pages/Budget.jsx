import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Legend, Loading, StatTile, ViewToggle, useTooltip,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { downloadCsv } from '../lib/api.js';
import { money, moneyExact } from '../lib/format.js';

/** Budget Tracker (Section 7.5) — budgeted vs actual vs forecast, rolled up and per project. */
export default function Budget() {
  const { data, error, loading } = useApi('/portfolio/budget');
  const [view, setView] = useState('Chart');

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const { totals, byFiscalYear, byBudgetType, byBudgetStatus, projects, currency } = data;
  const unbudgeted = byBudgetStatus.find((r) => r.budget_status === 'unbudgeted');
  const pending = byBudgetStatus.find((r) => r.budget_status === 'pending');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budget tracker"
        description="Approved budget against actual and forecast spend, and how much of the book of work is running without funding."
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            <button type="button" className="btn btn-sm"
              onClick={() => downloadCsv('/export/budget.csv', 'gfm-budget.csv')}>
              Export CSV
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Approved budget" value={money(totals.budgeted, currency)} />
        <StatTile label="Actual to date" value={money(totals.actual, currency)} />
        <StatTile
          label="Forecast"
          value={money(totals.forecast, currency)}
          hint={`${totals.variance > 0 ? 'Over' : 'Under'} budget by ${money(Math.abs(totals.variance), currency)}`}
          status={totals.variance > 0 ? 'red' : 'green'}
        />
        <StatTile
          label="Unbudgeted + pending"
          value={money((unbudgeted?.forecast || 0) + (pending?.forecast || 0), currency)}
          hint="Forecast spend with no approved funding line behind it"
          status={(unbudgeted?.forecast || 0) > 0 ? 'amber' : 'green'}
        />
      </div>

      {view === 'Chart' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="By fiscal year" subtitle="One measure, one axis — all three series are money.">
            <GroupedBars rows={byFiscalYear.map((r) => ({ label: r.fiscal_year, ...r }))} currency={currency} />
          </Card>
          <Card title="By funding type" subtitle="How much of the portfolio is properly budgeted.">
            <GroupedBars
              rows={byBudgetType.map((r) => ({ label: r.budget_type, ...r }))}
              currency={currency}
            />
          </Card>
        </div>
      ) : (
        <Card title="Rollups" bodyClass="">
          <div className="scroll-x">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Grouping</th><th>Key</th>
                  <th className="num">Budgeted</th><th className="num">Actual</th>
                  <th className="num">Forecast</th><th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {byFiscalYear.map((r) => (
                  <tr key={`fy-${r.fiscal_year}`}>
                    <td className="muted">Fiscal year</td>
                    <td>{r.fiscal_year}</td>
                    <td className="num">{moneyExact(r.budgeted, currency)}</td>
                    <td className="num">{moneyExact(r.actual, currency)}</td>
                    <td className="num">{moneyExact(r.forecast, currency)}</td>
                    <td className="num" style={{ color: r.variance > 0 ? 'var(--status-critical)' : undefined }}>
                      {moneyExact(r.variance, currency)}
                    </td>
                  </tr>
                ))}
                {byBudgetType.map((r) => (
                  <tr key={`bt-${r.budget_type}`}>
                    <td className="muted">Funding type</td>
                    <td className="capitalize">{r.budget_type}</td>
                    <td className="num">{moneyExact(r.budgeted, currency)}</td>
                    <td className="num">{moneyExact(r.actual, currency)}</td>
                    <td className="num">{moneyExact(r.forecast, currency)}</td>
                    <td className="num" style={{ color: r.variance > 0 ? 'var(--status-critical)' : undefined }}>
                      {moneyExact(r.variance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="By project" subtitle="Highest forecast first." bodyClass="">
        <div className="scroll-x" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '5.5rem' }}>Code</th>
                <th>Project</th>
                <th>Funding</th>
                <th>Budget status</th>
                <th className="num">Budgeted</th>
                <th className="num">Actual</th>
                <th className="num">Forecast</th>
                <th className="num">Variance</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.code}</td>
                  <td>
                    <Link to={`/projects/${p.id}`} style={{ color: 'var(--series-1)' }}>{p.name}</Link>
                  </td>
                  <td className="secondary capitalize">{p.budget_type}</td>
                  <td className="secondary capitalize text-xs">{p.budget_statuses || '—'}</td>
                  <td className="num">{moneyExact(p.budgeted, currency)}</td>
                  <td className="num">{moneyExact(p.actual, currency)}</td>
                  <td className="num">{moneyExact(p.forecast, currency)}</td>
                  <td className="num font-semibold"
                    style={{ color: p.variance > 0 ? 'var(--status-critical)' : 'var(--success-text)' }}>
                    {p.variance > 0 ? '+' : ''}{moneyExact(p.variance, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * Grouped bars — three money series on one axis. Never two y-scales: every
 * series here is the same measure in the same currency.
 */
function GroupedBars({ rows, currency }) {
  const tooltip = useTooltip();
  const series = [
    { key: 'budgeted', label: 'Budgeted', color: 'var(--series-1)' },
    { key: 'forecast', label: 'Forecast', color: 'var(--series-2)' },
    { key: 'actual', label: 'Actual', color: 'var(--series-3)' },
  ];
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] || 0)));

  return (
    <div>
      <Legend items={series} />
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between text-[0.8125rem] mb-1">
              <span className="font-medium capitalize">{row.label}</span>
              <span className="num muted text-xs">
                {money(row.forecast, currency)} forecast
              </span>
            </div>
            <div className="space-y-[3px]">
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2"
                  onMouseEnter={(e) => tooltip.show(e, (
                    <div>
                      <div className="font-semibold capitalize">{row.label}</div>
                      <div className="secondary">{s.label}: {moneyExact(row[s.key], currency)}</div>
                    </div>
                  ))}
                  onMouseMove={tooltip.move}
                  onMouseLeave={tooltip.hide}
                >
                  <div className="flex-1 h-2.5 rounded-[3px]" style={{ background: 'var(--gridline)' }}>
                    <div
                      className="h-full rounded-[3px]"
                      style={{ width: `${((row[s.key] || 0) / max) * 100}%`, background: s.color }}
                    />
                  </div>
                  <span className="num text-[0.6875rem] muted w-20 text-right">
                    {money(row[s.key], currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {tooltip.node}
    </div>
  );
}
