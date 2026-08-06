import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Legend, Loading, Pill, Select, StatusChip, useTooltip,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import {
  date, dateShort, fte, money, moneyExact, pct,
} from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

const TABS = ['Schedule', 'RAG', 'Budget', 'Resourcing'];

const MILESTONE_STATUS_TO_RAG = {
  done: 'green', 'in progress': 'green', 'not started': null, delayed: 'red',
};

/** Project Detail (Section 7.3) — everything about one project, editable by its owners. */
export default function ProjectDetail() {
  const { id } = useParams();
  const { reference } = useAuth();
  const [tab, setTab] = useState('Schedule');
  const [error, setError] = useState(null);
  const { data: project, error: loadError, loading, reload } = useApi(`/projects/${id}`, [id]);

  if (loading) return <Loading />;
  if (loadError) return <ErrorBanner error={loadError} />;

  const canEdit = project.can_edit;
  const act = async (fn) => {
    setError(null);
    try { await fn(); await reload(); } catch (err) { setError(err); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={project.name}
        description={project.description}
        actions={<Link to="/portfolio" className="btn btn-sm">Back to portfolio</Link>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill>{project.code}</Pill>
        <StatusChip status={project.worst_rag} />
        <Pill tone={project.psc_tier === 'PSC-governed' ? 'accent' : 'default'}>{project.psc_tier}</Pill>
        <Pill>{project.status}</Pill>
        <Pill>{project.budget_type}</Pill>
        {!canEdit && <span className="text-xs muted">Read-only — you do not own this project.</span>}
      </div>

      {project.psc_tier_advice && (
        <Card>
          <p className="text-[0.8125rem]" style={{ color: 'var(--status-warning)' }}>
            ▲ {project.psc_tier_advice.message}
          </p>
        </Card>
      )}

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Owners & dates" className="lg:col-span-1">
          <dl className="space-y-2 text-[0.8125rem]">
            <Row label="Sponsor" value={project.sponsor} />
            <Row label="PM owner" value={project.pm_owner_name} />
            <Row label="Biz Lead owner" value={project.biz_lead_owner_name} />
            <Row label="Start" value={date(project.start_date)} />
            <Row label="Target end" value={date(project.target_end_date)} />
            <Row
              label="Milestones done"
              value={project.milestone_progress_pct == null ? '—' : pct(project.milestone_progress_pct)}
            />
            <Row label="Allocated FTE" value={fte(project.allocated_fte)} />
          </dl>
          {project.source_demand?.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--gridline)' }}>
              <div className="label">Converted from demand</div>
              {project.source_demand.map((d) => (
                <Link key={d.id} to={`/demand/${d.id}`} className="block text-[0.8125rem]"
                  style={{ color: 'var(--series-1)' }}>
                  {d.title} ({d.tshirt_size || 'unsized'})
                </Link>
              ))}
            </div>
          )}
          {canEdit && (
            <EditProjectForm project={project} reference={reference}
              onSave={(patch) => act(() => api.patch(`/projects/${project.id}`, patch))} />
          )}
        </Card>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-[7px] text-[0.8125rem] font-semibold"
                style={tab === t
                  ? { background: 'var(--series-1)', color: '#fff' }
                  : { color: 'var(--text-secondary)' }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'Schedule' && (
            <ScheduleTab project={project} canEdit={canEdit} reference={reference} act={act} />
          )}
          {tab === 'RAG' && (
            <RagTab project={project} canEdit={canEdit} reference={reference} act={act} />
          )}
          {tab === 'Budget' && (
            <BudgetTab project={project} canEdit={canEdit} reference={reference} act={act} />
          )}
          {tab === 'Resourcing' && (
            <ResourcingTab project={project} canEdit={canEdit} reference={reference} act={act} />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="secondary">{label}</dt>
      <dd className="font-medium text-right">{value || '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

function ScheduleTab({ project, canEdit, reference, act }) {
  const [form, setForm] = useState({ name: '', planned_date: '', status: 'not started' });

  return (
    <div className="space-y-4">
      <Card title="Schedule" subtitle="Milestones against the project window.">
        <Gantt project={project} />
      </Card>

      <Card title="Milestones" bodyClass="">
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th style={{ width: '8rem' }}>Planned</th>
                <th style={{ width: '8rem' }}>Actual</th>
                <th style={{ width: '9rem' }}>Status</th>
                {canEdit && <th style={{ width: '5rem' }} />}
              </tr>
            </thead>
            <tbody>
              {project.milestones.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}</td>
                  <td className="secondary">{dateShort(m.planned_date)}</td>
                  <td className="secondary">{dateShort(m.actual_date)}</td>
                  <td>
                    {canEdit ? (
                      <Select
                        value={m.status}
                        options={reference?.milestoneStatuses || []}
                        onChange={(v) => act(() => api.patch(
                          `/projects/${project.id}/milestones/${m.id}`,
                          { status: v, ...(v === 'done' && !m.actual_date
                            ? { actual_date: new Date().toISOString().slice(0, 10) } : {}) }
                        ))}
                      />
                    ) : (
                      <span className="secondary capitalize">{m.status}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <button type="button" className="btn btn-sm btn-danger"
                        onClick={() => act(() => api.del(`/projects/${project.id}/milestones/${m.id}`))}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {project.milestones.length === 0 && (
                <tr><td colSpan={5} className="muted text-center py-6">No milestones yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <form
            className="flex flex-wrap items-end gap-2 p-3"
            style={{ borderTop: '1px solid var(--gridline)' }}
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api.post(`/projects/${project.id}/milestones`, form);
                setForm({ name: '', planned_date: '', status: 'not started' });
              });
            }}
          >
            <Field label="New milestone" className="flex-1 min-w-52">
              <input className="field" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Planned date" className="w-40">
              <input className="field" type="date" value={form.planned_date}
                onChange={(e) => setForm({ ...form, planned_date: e.target.value })} />
            </Field>
            <button type="submit" className="btn btn-primary">Add</button>
          </form>
        )}
      </Card>
    </div>
  );
}

/** A minimal Gantt: the project window, its milestones, and today. */
function Gantt({ project }) {
  const tooltip = useTooltip();
  const start = project.start_date;
  const end = project.target_end_date;
  if (!start || !end) {
    return <p className="text-sm muted">Set a start and target end date to see the schedule.</p>;
  }

  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const t1 = new Date(`${end}T00:00:00Z`).getTime();
  const span = Math.max(1, t1 - t0);
  const position = (iso) => {
    const t = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getTime();
    return Math.max(0, Math.min(100, ((t - t0) / span) * 100));
  };
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayInRange = todayIso >= start && todayIso <= end;

  return (
    <div>
      <Legend items={[
        { label: 'Project window', color: 'var(--series-1)' },
        { label: 'Milestone', color: 'var(--text-secondary)' },
      ]} />
      <div className="relative mt-4 mb-2" style={{ height: 56 }}>
        <div className="absolute inset-x-0 top-5 h-3 rounded-[3px]"
          style={{ background: 'var(--series-1)', opacity: 0.22 }} />
        {todayInRange && (
          <div
            className="absolute top-0 bottom-4 w-px"
            style={{ left: `${position(todayIso)}%`, background: 'var(--text-secondary)' }}
            title={`Today · ${todayIso}`}
          />
        )}
        {project.milestones.filter((m) => m.planned_date).map((m) => (
          <div
            key={m.id}
            className="absolute"
            style={{ left: `${position(m.planned_date)}%`, top: 14, transform: 'translateX(-50%)' }}
            onMouseEnter={(e) => tooltip.show(e, (
              <div>
                <div className="font-semibold">{m.name}</div>
                <div className="secondary">Planned {date(m.planned_date)}</div>
                {m.actual_date && <div className="secondary">Actual {date(m.actual_date)}</div>}
                <div className="secondary capitalize">Status: {m.status}</div>
              </div>
            ))}
            onMouseMove={tooltip.move}
            onMouseLeave={tooltip.hide}
          >
            <div
              style={{
                width: 11, height: 11, transform: 'rotate(45deg)',
                background: m.status === 'delayed' ? 'var(--status-critical)'
                  : m.status === 'done' ? 'var(--status-good)' : 'var(--surface-1)',
                border: `2px solid ${m.status === 'delayed' ? 'var(--status-critical)'
                  : m.status === 'done' ? 'var(--status-good)' : 'var(--text-secondary)'}`,
              }}
            />
          </div>
        ))}
        <div className="absolute left-0 bottom-0 text-[0.6875rem] muted">{dateShort(start)}</div>
        <div className="absolute right-0 bottom-0 text-[0.6875rem] muted">{dateShort(end)}</div>
      </div>
      <p className="text-xs muted">
        Delayed milestones are shown in the critical status colour and named in the table below —
        never colour alone.
      </p>
      {tooltip.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RAG
// ---------------------------------------------------------------------------

function RagTab({ project, canEdit, reference, act }) {
  const [form, setForm] = useState({ stream: '', status: 'Amber', commentary: '' });

  return (
    <Card
      title="RAG by stream"
      subtitle="A separate entry per stream — that is what surfaces specific issues instead of one blended flag."
      bodyClass=""
    >
      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ width: '10rem' }}>Stream</th>
              <th style={{ width: '7rem' }}>Status</th>
              <th>Commentary</th>
              <th style={{ width: '8rem' }}>Updated</th>
              {canEdit && <th style={{ width: '5rem' }} />}
            </tr>
          </thead>
          <tbody>
            {project.rag_entries.map((entry) => (
              <RagRow key={entry.id} entry={entry} project={project} canEdit={canEdit}
                reference={reference} act={act} />
            ))}
            {project.rag_entries.length === 0 && (
              <tr><td colSpan={5} className="muted text-center py-6">No RAG entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 p-3"
          style={{ borderTop: '1px solid var(--gridline)' }}
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await api.post(`/projects/${project.id}/rag`, form);
              setForm({ stream: '', status: 'Amber', commentary: '' });
            });
          }}
        >
          <Field label="Stream" className="w-44">
            <Select
              value={form.stream}
              onChange={(v) => setForm({ ...form, stream: v })}
              includeAll allLabel="Choose…"
              options={(reference?.streams || []).map((s) => ({ value: s.key, label: s.label }))}
              required
            />
          </Field>
          <Field label="Status" className="w-32">
            <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={reference?.ragStatuses || []} />
          </Field>
          <Field label="Commentary" className="flex-1 min-w-64"
            hint="Required for Red and Amber.">
            <input className="field" value={form.commentary}
              onChange={(e) => setForm({ ...form, commentary: e.target.value })} />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={!form.stream}>Add</button>
        </form>
      )}
    </Card>
  );
}

function RagRow({ entry, project, canEdit, reference, act }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ status: entry.status, commentary: entry.commentary || '' });

  if (editing) {
    return (
      <tr>
        <td className="secondary">{entry.stream_label || entry.stream}</td>
        <td>
          <Select value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })}
            options={reference?.ragStatuses || []} />
        </td>
        <td colSpan={2}>
          <input className="field" value={draft.commentary}
            onChange={(e) => setDraft({ ...draft, commentary: e.target.value })} />
        </td>
        <td className="space-y-1">
          <button type="button" className="btn btn-sm btn-primary w-full"
            onClick={() => act(async () => {
              await api.patch(`/projects/${project.id}/rag/${entry.id}`, draft);
              setEditing(false);
            })}>
            Save
          </button>
          <button type="button" className="btn btn-sm w-full" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="secondary">{entry.stream_label || entry.stream}</td>
      <td><StatusChip status={entry.status} /></td>
      <td className="secondary">{entry.commentary || <span className="muted">—</span>}</td>
      <td className="secondary text-xs">
        {dateShort(entry.updated_date)}
        {entry.updated_by_name && <div className="muted">{entry.updated_by_name}</div>}
      </td>
      {canEdit && (
        <td className="space-y-1">
          <button type="button" className="btn btn-sm w-full" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="btn btn-sm btn-danger w-full"
            onClick={() => act(() => api.del(`/projects/${project.id}/rag/${entry.id}`))}>
            Delete
          </button>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

function BudgetTab({ project, canEdit, reference, act }) {
  const [form, setForm] = useState({
    fiscal_year: String(new Date().getFullYear()), budgeted_amount: '', forecast_spend: '',
    actual_spend: '', budget_status: 'approved',
  });
  const currency = project.budget_lines[0]?.currency || 'SGD';

  return (
    <Card title="Budget lines" subtitle="One line per fiscal year." bodyClass="">
      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Fiscal year</th>
              <th>Status</th>
              <th className="num">Budgeted</th>
              <th className="num">Actual</th>
              <th className="num">Forecast</th>
              <th className="num">Variance</th>
              {canEdit && <th style={{ width: '5rem' }} />}
            </tr>
          </thead>
          <tbody>
            {project.budget_lines.map((line) => (
              <tr key={line.id}>
                <td className="font-medium">{line.fiscal_year}</td>
                <td className="secondary capitalize">{line.budget_status}</td>
                <td className="num">{moneyExact(line.budgeted_amount, line.currency)}</td>
                <td className="num">
                  {canEdit ? (
                    <input
                      className="field num" type="number" defaultValue={line.actual_spend}
                      onBlur={(e) => {
                        if (Number(e.target.value) === line.actual_spend) return;
                        act(() => api.patch(`/projects/${project.id}/budget/${line.id}`,
                          { actual_spend: Number(e.target.value) }));
                      }}
                    />
                  ) : moneyExact(line.actual_spend, line.currency)}
                </td>
                <td className="num">
                  {canEdit ? (
                    <input
                      className="field num" type="number" defaultValue={line.forecast_spend}
                      onBlur={(e) => {
                        if (Number(e.target.value) === line.forecast_spend) return;
                        act(() => api.patch(`/projects/${project.id}/budget/${line.id}`,
                          { forecast_spend: Number(e.target.value) }));
                      }}
                    />
                  ) : moneyExact(line.forecast_spend, line.currency)}
                </td>
                <td className="num font-semibold" style={{
                  color: line.forecast_spend > line.budgeted_amount
                    ? 'var(--status-critical)' : 'var(--success-text)',
                }}>
                  {moneyExact(line.forecast_spend - line.budgeted_amount, line.currency)}
                </td>
                {canEdit && (
                  <td>
                    <button type="button" className="btn btn-sm btn-danger"
                      onClick={() => act(() => api.del(`/projects/${project.id}/budget/${line.id}`))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {project.budget_lines.length === 0 && (
              <tr><td colSpan={7} className="muted text-center py-6">No budget lines yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td className="font-semibold" colSpan={2}>Total</td>
              <td className="num font-semibold">{moneyExact(project.budgeted_amount, currency)}</td>
              <td className="num font-semibold">{moneyExact(project.actual_spend, currency)}</td>
              <td className="num font-semibold">{moneyExact(project.forecast_spend, currency)}</td>
              <td className="num font-semibold" style={{
                color: project.budget_variance > 0 ? 'var(--status-critical)' : 'var(--success-text)',
              }}>
                {moneyExact(project.budget_variance, currency)}
              </td>
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 p-3"
          style={{ borderTop: '1px solid var(--gridline)' }}
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await api.post(`/projects/${project.id}/budget`, form);
              setForm({ ...form, budgeted_amount: '', forecast_spend: '', actual_spend: '' });
            });
          }}
        >
          <Field label="Fiscal year" className="w-28">
            <input className="field" required value={form.fiscal_year}
              onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} />
          </Field>
          <Field label="Budgeted" className="w-32">
            <input className="field num" type="number" value={form.budgeted_amount}
              onChange={(e) => setForm({ ...form, budgeted_amount: e.target.value })} />
          </Field>
          <Field label="Forecast" className="w-32">
            <input className="field num" type="number" value={form.forecast_spend}
              onChange={(e) => setForm({ ...form, forecast_spend: e.target.value })} />
          </Field>
          <Field label="Status" className="w-36">
            <Select value={form.budget_status} onChange={(v) => setForm({ ...form, budget_status: v })}
              options={reference?.budgetStatuses || []} />
          </Field>
          <button type="submit" className="btn btn-primary">Add line</button>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resourcing
// ---------------------------------------------------------------------------

function ResourcingTab({ project, canEdit, reference, act }) {
  const { data: people } = useApi('/people?active=true', []);
  const [form, setForm] = useState({
    role: 'Developer', person_id: '', allocation_pct: '0.5',
    start_date: project.start_date || '', end_date: project.target_end_date || '',
  });

  return (
    <Card
      title="Resourcing"
      subtitle="Every row here consumes role capacity on the Resourcing & capacity screen, named or not."
      bodyClass=""
    >
      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ width: '8rem' }}>Role</th>
              <th>Person</th>
              <th className="num" style={{ width: '6rem' }}>FTE</th>
              <th style={{ width: '8rem' }}>From</th>
              <th style={{ width: '8rem' }}>To</th>
              <th style={{ width: '7rem' }}>Source</th>
              {canEdit && <th style={{ width: '5rem' }} />}
            </tr>
          </thead>
          <tbody>
            {project.allocations.map((alloc) => (
              <tr key={alloc.id}>
                <td className="font-medium">{alloc.role}</td>
                <td className="secondary">
                  {alloc.person_name || (
                    <span style={{ color: 'var(--status-warning)' }}>▲ Unassigned placeholder</span>
                  )}
                  {alloc.notes && <div className="text-[0.6875rem] muted mt-0.5">{alloc.notes}</div>}
                </td>
                <td className="num">
                  {canEdit ? (
                    <input
                      className="field num" type="number" step="0.05" min="0.05"
                      defaultValue={alloc.allocation_pct}
                      onBlur={(e) => {
                        if (Number(e.target.value) === alloc.allocation_pct) return;
                        act(() => api.patch(`/projects/${project.id}/allocations/${alloc.id}`,
                          { allocation_pct: Number(e.target.value) }));
                      }}
                    />
                  ) : fte(alloc.allocation_pct)}
                </td>
                <td className="secondary">{dateShort(alloc.start_date)}</td>
                <td className="secondary">{dateShort(alloc.end_date)}</td>
                <td className="secondary text-xs">
                  {alloc.source === 'converted_demand' ? 'From demand' : 'Manual'}
                </td>
                {canEdit && (
                  <td>
                    <button type="button" className="btn btn-sm btn-danger"
                      onClick={() => act(() => api.del(`/projects/${project.id}/allocations/${alloc.id}`))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {project.allocations.length === 0 && (
              <tr><td colSpan={7} className="muted text-center py-6">No allocations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 p-3"
          style={{ borderTop: '1px solid var(--gridline)' }}
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.post(`/projects/${project.id}/allocations`, {
              ...form,
              person_id: form.person_id ? Number(form.person_id) : null,
              allocation_pct: Number(form.allocation_pct),
            }));
          }}
        >
          <Field label="Role" className="w-36">
            <Select value={form.role} onChange={(v) => setForm({ ...form, role: v, person_id: '' })}
              options={reference?.roles || []} />
          </Field>
          <Field label="Person" className="w-52" hint="Leave blank for a placeholder.">
            <Select
              value={form.person_id}
              onChange={(v) => setForm({ ...form, person_id: v })}
              includeAll allLabel="Unassigned"
              options={(people || []).filter((p) => p.role === form.role)
                .map((p) => ({ value: String(p.id), label: p.name }))}
            />
          </Field>
          <Field label="FTE" className="w-24">
            <input className="field num" type="number" step="0.05" min="0.05" required
              value={form.allocation_pct}
              onChange={(e) => setForm({ ...form, allocation_pct: e.target.value })} />
          </Field>
          <Field label="From" className="w-40">
            <input className="field" type="date" required value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="To" className="w-40">
            <input className="field" type="date" required value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Field>
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EditProjectForm({ project, reference, onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    status: project.status,
    psc_tier: project.psc_tier,
    budget_type: project.budget_type,
    start_date: project.start_date || '',
    target_end_date: project.target_end_date || '',
    sponsor: project.sponsor || '',
  });

  if (!open) {
    return (
      <button type="button" className="btn btn-sm mt-3 w-full" onClick={() => setOpen(true)}>
        Edit project
      </button>
    );
  }

  return (
    <form
      className="mt-3 pt-3 space-y-2"
      style={{ borderTop: '1px solid var(--gridline)' }}
      onSubmit={(e) => { e.preventDefault(); onSave(draft); setOpen(false); }}
    >
      <Field label="Status">
        <Select value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })}
          options={reference?.projectStatuses || []} />
      </Field>
      <Field label="PSC tier">
        <Select value={draft.psc_tier} onChange={(v) => setDraft({ ...draft, psc_tier: v })}
          options={reference?.pscTiers || []} />
      </Field>
      <Field label="Funding">
        <Select value={draft.budget_type} onChange={(v) => setDraft({ ...draft, budget_type: v })}
          options={reference?.budgetTypes || []} />
      </Field>
      <Field label="Sponsor">
        <input className="field" value={draft.sponsor}
          onChange={(e) => setDraft({ ...draft, sponsor: e.target.value })} />
      </Field>
      <Field label="Start date">
        <input className="field" type="date" value={draft.start_date}
          onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
      </Field>
      <Field label="Target end date">
        <input className="field" type="date" value={draft.target_end_date}
          onChange={(e) => setDraft({ ...draft, target_end_date: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm flex-1">Save</button>
        <button type="button" className="btn btn-sm flex-1" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
