import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Legend, Loading, Select, StatusChip, Toolbar, ViewToggle,
} from '../components/ui.jsx';
import { useApi, query } from '../lib/useApi.js';
import { downloadCsv } from '../lib/api.js';
import { date } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * RAG Dashboard (Section 7.4) — portfolio-wide, by stream, surfacing every
 * current Red and Amber with its commentary. Status colours are the reserved
 * status tokens and always ship with a glyph and the word.
 */
export default function RagDashboard() {
  const { reference } = useAuth();
  const [filters, setFilters] = useState({ status: 'Red,Amber', stream: '', psc_tier: '' });
  const [view, setView] = useState('Chart');

  const params = query(filters);
  const { data, error, loading, stale } = useApi(
    `/portfolio/rag${params}`,
    [filters.status, filters.stream, filters.psc_tier]
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const reds = data.entries.filter((e) => e.status === 'Red');
  const ambers = data.entries.filter((e) => e.status === 'Amber');

  return (
    <div className="space-y-4">
      <PageHeader
        title="RAG dashboard"
        description="One project has a RAG entry per stream, not a single blended flag — that is what turns health into a list of specific issues."
        actions={
          <button type="button" className="btn btn-sm"
            onClick={() => downloadCsv('/export/rag.csv', 'gfm-rag.csv')}>
            Export CSV
          </button>
        }
      />

      <Toolbar>
        <Field label="Status" className="w-44">
          <Select
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            includeAll allLabel="All statuses"
            options={[
              { value: 'Red,Amber', label: 'Exceptions (Red + Amber)' },
              { value: 'Red', label: 'Red only' },
              { value: 'Amber', label: 'Amber only' },
              { value: 'Green', label: 'Green only' },
            ]}
          />
        </Field>
        <Field label="Stream" className="w-52">
          <Select
            value={filters.stream}
            onChange={(v) => setFilters({ ...filters, stream: v })}
            includeAll allLabel="All streams"
            options={(reference?.streams || []).map((s) => ({ value: s.key, label: s.label }))}
          />
        </Field>
        <Field label="PSC tier" className="w-40">
          <Select
            value={filters.psc_tier}
            onChange={(v) => setFilters({ ...filters, psc_tier: v })}
            includeAll allLabel="All tiers"
            options={reference?.pscTiers || []}
          />
        </Field>
        <div className="ml-auto pb-0.5">
          <ViewToggle view={view} onChange={setView} />
        </div>
      </Toolbar>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><div className="flex items-center gap-3">
          <StatusChip status="Red" size="md" />
          <div>
            <div className="text-2xl font-semibold leading-none">{reds.length}</div>
            <div className="text-xs muted mt-1">Red entries in scope</div>
          </div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <StatusChip status="Amber" size="md" />
          <div>
            <div className="text-2xl font-semibold leading-none">{ambers.length}</div>
            <div className="text-xs muted mt-1">Amber entries in scope</div>
          </div>
        </div></Card>
        <Card><div className="flex items-center gap-3">
          <div>
            <div className="text-2xl font-semibold leading-none">
              {new Set(data.entries.map((e) => e.project_id)).size}
            </div>
            <div className="text-xs muted mt-1">Distinct projects affected</div>
          </div>
        </div></Card>
      </div>

      <Card
        title="By stream"
        subtitle="Where the issues cluster across the portfolio."
      >
        <div style={stale ? { opacity: 0.6 } : undefined}>
          <Legend items={[
            { label: 'Red', color: 'var(--status-critical)' },
            { label: 'Amber', color: 'var(--status-warning)' },
            { label: 'Green', color: 'var(--status-good)' },
          ]} />
          <div className="mt-3 space-y-2">
            {data.byStream.map((row) => {
              const total = row.Red + row.Amber + row.Green;
              return (
                <div key={row.stream} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
                  <span className="text-[0.8125rem] secondary truncate">{row.label}</span>
                  <div className="flex h-4 rounded-[3px] overflow-hidden"
                    style={{ background: 'var(--gridline)' }}>
                    {[
                      ['Red', 'var(--status-critical)'],
                      ['Amber', 'var(--status-warning)'],
                      ['Green', 'var(--status-good)'],
                    ].map(([key, color], i) => (
                      row[key] > 0 && (
                        <div
                          key={key}
                          title={`${key}: ${row[key]}`}
                          style={{
                            width: `${(row[key] / total) * 100}%`,
                            background: color,
                            // 2px surface gap between segments, not a border.
                            marginLeft: i === 0 ? 0 : 2,
                          }}
                        />
                      )
                    ))}
                  </div>
                  <span className="num text-xs muted w-24 text-right">
                    {row.Red} R · {row.Amber} A · {row.Green} G
                  </span>
                </div>
              );
            })}
            {data.byStream.length === 0 && (
              <p className="text-sm muted py-4 text-center">Nothing matches these filters.</p>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={view === 'Chart' ? 'Exceptions and commentary' : 'All entries'}
        subtitle="Sorted worst first. Commentary is what makes an entry actionable."
        bodyClass=""
      >
        <div className="scroll-x">
          <table className="grid-table" style={stale ? { opacity: 0.6 } : undefined}>
            <thead>
              <tr>
                <th style={{ width: '5rem' }}>RAG</th>
                <th style={{ width: '9rem' }}>Stream</th>
                <th style={{ width: '16rem' }}>Project</th>
                <th>Commentary</th>
                <th style={{ width: '9rem' }}>Owner</th>
                <th style={{ width: '7rem' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td><StatusChip status={entry.status} /></td>
                  <td className="secondary">{entry.stream_label || entry.stream}</td>
                  <td>
                    <Link to={`/projects/${entry.project_id}`} style={{ color: 'var(--series-1)' }}>
                      {entry.project_name}
                    </Link>
                    {entry.psc_tier === 'PSC-governed' && (
                      <span className="muted text-[0.6875rem] ml-1">PSC</span>
                    )}
                  </td>
                  <td className="secondary">{entry.commentary || <span className="muted">—</span>}</td>
                  <td className="secondary text-xs">{entry.pm_owner_name || '—'}</td>
                  <td className="secondary text-xs">{date(entry.updated_date)}</td>
                </tr>
              ))}
              {data.entries.length === 0 && (
                <tr><td colSpan={6} className="text-center muted py-8">
                  Nothing matches these filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
