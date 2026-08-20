import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Loading, Modal, Select, StatusChip, Toolbar,
} from '../components/ui.jsx';
import { useApi, query } from '../lib/useApi.js';
import { api, downloadCsv } from '../lib/api.js';
import { dateShort, fte, money, pct } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

const COLUMNS = [
  { key: 'code', label: 'Code', width: '5.5rem' },
  { key: 'name', label: 'Project' },
  { key: 'worst_rag', label: 'RAG' },
  { key: 'status', label: 'Status' },
  { key: 'psc_tier', label: 'Tier' },
  { key: 'budget_type', label: 'Funding' },
  { key: 'pm_owner_name', label: 'PM' },
  { key: 'biz_lead_owner_name', label: 'Biz Lead' },
  { key: 'target_end_date', label: 'Target end', num: true },
  { key: 'milestone_progress_pct', label: 'Milestones', num: true },
  { key: 'budgeted_amount', label: 'Budget', num: true },
  { key: 'forecast_spend', label: 'Forecast', num: true },
  { key: 'allocated_fte', label: 'FTE', num: true },
];

const RAG_ORDER = { Red: 0, Amber: 1, Green: 2, null: 3 };

/** Project Portfolio Grid (Section 7.2) — all ~50 projects, sortable and filterable. */
export default function Portfolio() {
  const { canEdit, reference } = useAuth();
  const [filters, setFilters] = useState({
    status: 'active,on-hold', psc_tier: '', budget_type: '', rag: '', search: '',
  });
  const [sort, setSort] = useState({ key: 'worst_rag', dir: 'asc' });
  const [creating, setCreating] = useState(false);

  const params = query(filters);
  const { data, error, loading, stale, reload } = useApi(
    `/projects${params}`,
    [filters.status, filters.psc_tier, filters.budget_type, filters.rag, filters.search]
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'worst_rag') {
        return (RAG_ORDER[a.worst_rag] - RAG_ORDER[b.worst_rag]) * dir
          || a.name.localeCompare(b.name);
      }
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return a.name.localeCompare(b.name);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
    return sorted;
  }, [data, sort]);

  const toggleSort = (key) => setSort((prev) => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ));

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Project portfolio"
        description={`${rows.length} project${rows.length === 1 ? '' : 's'} matching the current filters.`}
        actions={
          <>
            <button type="button" className="btn btn-sm"
              onClick={() => downloadCsv(`/export/projects${params}`, 'gfm-projects.csv')}>
              Export CSV
            </button>
            {canEdit && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
                New project
              </button>
            )}
          </>
        }
      />

      <Toolbar>
        <Field label="Search" className="w-56">
          <input
            className="field"
            value={filters.search}
            placeholder="Name, code or sponsor"
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </Field>
        <Field label="Status" className="w-44">
          <Select
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            includeAll
            allLabel="All statuses"
            options={[
              { value: 'active,on-hold', label: 'Open (active + on hold)' },
              { value: 'active', label: 'Active' },
              { value: 'on-hold', label: 'On hold' },
              { value: 'closed', label: 'Closed' },
            ]}
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
        <Field label="Funding" className="w-44">
          <Select
            value={filters.budget_type}
            onChange={(v) => setFilters({ ...filters, budget_type: v })}
            includeAll allLabel="All funding types"
            options={reference?.budgetTypes || []}
          />
        </Field>
        <Field label="Worst RAG" className="w-36">
          <Select
            value={filters.rag}
            onChange={(v) => setFilters({ ...filters, rag: v })}
            includeAll allLabel="Any"
            options={[
              { value: 'Red', label: 'Red' },
              { value: 'Red,Amber', label: 'Red or Amber' },
              { value: 'Amber', label: 'Amber' },
              { value: 'Green', label: 'Green' },
            ]}
          />
        </Field>
      </Toolbar>

      <Card bodyClass="">
        <div className="scroll-x" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="grid-table" style={stale ? { opacity: 0.6 } : undefined}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`sortable ${col.num ? 'num' : ''}`}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sort.key === col.key && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.code}</td>
                  <td>
                    <Link to={`/projects/${p.id}`} className="font-medium"
                      style={{ color: 'var(--series-1)' }}>
                      {p.name}
                    </Link>
                    {p.psc_tier_advice && (
                      <div className="text-[0.6875rem] mt-0.5" style={{ color: 'var(--status-warning)' }}>
                        ▲ Tier looks wrong: {p.psc_tier_advice.expected} expected for this budget
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusChip status={p.worst_rag} />
                    {p.rag_red > 0 && <span className="muted text-[0.6875rem] ml-1">×{p.rag_red}</span>}
                  </td>
                  <td className="secondary capitalize">{p.status}</td>
                  <td className="secondary">{p.psc_tier === 'PSC-governed' ? 'PSC' : '—'}</td>
                  <td className="secondary capitalize">{p.budget_type}</td>
                  <td className="secondary">{p.pm_owner_name || '—'}</td>
                  <td className="secondary">{p.biz_lead_owner_name || '—'}</td>
                  <td className="num secondary">{dateShort(p.target_end_date)}</td>
                  <td className="num">{p.milestone_progress_pct == null ? '—' : pct(p.milestone_progress_pct)}</td>
                  <td className="num">{money(p.budgeted_amount)}</td>
                  <td className="num" style={{
                    color: p.budget_variance > 0 ? 'var(--status-critical)' : undefined,
                  }}>
                    {money(p.forecast_spend)}
                  </td>
                  <td className="num secondary">{fte(p.allocated_fte)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="text-center muted py-8">
                  No projects match these filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && (
        <NewProjectModal
          reference={reference}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); }}
        />
      )}
    </div>
  );
}

function NewProjectModal({ reference, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', description: '', sponsor: '', psc_tier: 'Non-PSC', status: 'active',
    budget_type: 'budgeted', start_date: '', target_end_date: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/projects', form);
      onCreated();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <Modal title="New project" onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Name">
          <input className="field" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Description">
          <textarea className="field" rows={2} value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sponsor">
            <input className="field" value={form.sponsor} onChange={set('sponsor')} />
          </Field>
          <Field label="PSC tier" hint="Governed at or above the threshold.">
            <Select value={form.psc_tier} onChange={(v) => setForm({ ...form, psc_tier: v })}
              options={reference?.pscTiers || []} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={reference?.projectStatuses || []} />
          </Field>
          <Field label="Funding">
            <Select value={form.budget_type} onChange={(v) => setForm({ ...form, budget_type: v })}
              options={reference?.budgetTypes || []} />
          </Field>
          <Field label="Start date">
            <input className="field" type="date" value={form.start_date} onChange={set('start_date')} />
          </Field>
          <Field label="Target end date">
            <input className="field" type="date" value={form.target_end_date}
              onChange={set('target_end_date')} />
          </Field>
        </div>
        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
