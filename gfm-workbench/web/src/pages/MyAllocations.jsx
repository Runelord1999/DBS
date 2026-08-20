import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Loading, StatTile, StatusChip,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { dateShort, days, fte, pct } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * The resourced team member's view (Section 2): their own allocations across
 * every project, and nothing else. Deliberately a different screen from the PM
 * and exec views rather than the same grid with rows hidden.
 */
export default function MyAllocations() {
  const { user, person } = useAuth();
  const { data, error, loading } = useApi('/people/me/capacity');

  if (!person) {
    return (
      <Card title="No resource record linked">
        <p className="text-[0.8125rem] secondary">
          Your login ({user.email}) is not linked to a person record, so there are no
          allocations to show. An admin can link it in the Admin screen.
        </p>
      </Card>
    );
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const current = data.periodRows.find((row) => {
    const period = data.periods.find((p) => p.key === row.key);
    const today = new Date().toISOString().slice(0, 10);
    return period && today >= period.start && today <= period.end;
  }) || data.periodRows[0];

  const active = data.allocations.filter((a) => a.project_status !== 'closed');

  return (
    <div className="space-y-4">
      <PageHeader
        title="My allocations"
        description={`${person.name} · ${person.role} · ${person.team}. Read-only — your PM or Biz Lead owns these numbers.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="This period"
          value={pct(current?.utilizationPct ?? 0)}
          status={current?.status}
          hint={current ? `${current.periodLabel} · ${days(current.allocatedDays)} of ${days(current.capacityDays)} days` : ''}
          emphasis
        />
        <StatTile label="Projects" value={new Set(active.map((a) => a.project_id)).size}
          hint="Open projects you are allocated to" />
        <StatTile
          label="Total FTE now"
          value={fte(active.reduce((sum, a) => {
            const today = new Date().toISOString().slice(0, 10);
            return today >= a.start_date && today <= a.end_date ? sum + a.allocation_pct : sum;
          }, 0))}
          hint="Sum of your current allocations"
        />
      </div>

      <Card title="By period" subtitle="Your capacity against what you are allocated to." bodyClass="">
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Capacity (d)</th>
                <th className="num">Allocated (d)</th>
                <th className="num">Remaining (d)</th>
                <th className="num">Utilisation</th>
                <th style={{ width: '7rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.periodRows.map((row) => (
                <tr key={row.key}>
                  <td className="font-medium">{row.periodLabel}</td>
                  <td className="num">{days(row.capacityDays)}</td>
                  <td className="num">{days(row.allocatedDays)}</td>
                  <td className="num" style={{
                    color: row.remainingDays < 0 ? 'var(--status-critical)' : undefined,
                  }}>
                    {days(row.remainingDays)}
                  </td>
                  <td className="num font-semibold">{pct(row.utilizationPct)}</td>
                  <td><StatusChip status={row.status} label={
                    row.status === 'red' ? 'Over' : row.status === 'amber' ? 'Tight' : 'OK'
                  } /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Allocations" subtitle="Every project you are booked to." bodyClass="">
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '5rem' }}>Code</th>
                <th>Project</th>
                <th style={{ width: '8rem' }}>Role</th>
                <th className="num" style={{ width: '5rem' }}>FTE</th>
                <th style={{ width: '7rem' }}>From</th>
                <th style={{ width: '7rem' }}>To</th>
                <th style={{ width: '7rem' }}>Project status</th>
              </tr>
            </thead>
            <tbody>
              {data.allocations.map((alloc) => (
                <tr key={alloc.id}>
                  <td className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {alloc.project_code}
                  </td>
                  <td>
                    <Link to={`/projects/${alloc.project_id}`} style={{ color: 'var(--series-1)' }}>
                      {alloc.project_name}
                    </Link>
                  </td>
                  <td className="secondary">{alloc.role}</td>
                  <td className="num">{fte(alloc.allocation_pct)}</td>
                  <td className="secondary">{dateShort(alloc.start_date)}</td>
                  <td className="secondary">{dateShort(alloc.end_date)}</td>
                  <td className="secondary capitalize">{alloc.project_status}</td>
                </tr>
              ))}
              {data.allocations.length === 0 && (
                <tr><td colSpan={7} className="muted text-center py-8">
                  You have no allocations in this window.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
