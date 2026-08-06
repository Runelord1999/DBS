import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Loading, Modal, Pill, Select,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { api, downloadCsv } from '../lib/api.js';
import { days, dateShort } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

const COLUMN_HINTS = {
  New: 'Raised, not yet sized.',
  'T-Shirt Sized': 'Tier 1 done — worth detailed sizing?',
  Triage: 'Tier 2 sizing + capacity check before a decision.',
  Approved: 'Converted into a project, budget line and allocations.',
  Rejected: 'Declined, with the reason recorded.',
  Deferred: 'Not now — usually because capacity says so.',
};

/** Demand Intake Queue (Sections 5 + 7.7) — Kanban, with sizing visible on every card. */
export default function Demand() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi('/demand');
  const [actionError, setActionError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const move = async (item, status) => {
    setActionError(null);
    if (status === 'Approved') {
      // Approval creates a project, a budget line and allocations — it runs
      // through the detail screen so the capacity impact is seen first.
      navigate(`/demand/${item.id}`);
      return;
    }
    if (status === 'Rejected' || status === 'Deferred') {
      navigate(`/demand/${item.id}`);
      return;
    }
    try {
      await api.put(`/demand/${item.id}/status`, { status });
      await reload();
    } catch (err) {
      setActionError(err);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Demand intake"
        description="Unplanned and unbudgeted demand, sized and tested against remaining capacity before anyone decides. Nothing reaches Approved without a Tier 2 estimate."
        actions={
          <>
            <button type="button" className="btn btn-sm"
              onClick={() => downloadCsv('/export/demand.csv', 'gfm-demand.csv')}>
              Export CSV
            </button>
            {canEdit && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
                Raise demand
              </button>
            )}
          </>
        }
      />

      {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

      <div className="scroll-x pb-2">
        <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
          {data.statuses.map((status) => (
            <div
              key={status}
              className="w-72 shrink-0"
              onDragOver={(e) => { if (canEdit && dragging) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (canEdit && dragging && dragging.status !== status) move(dragging, status);
                setDragging(null);
              }}
            >
              <div className="card card-pad mb-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="card-title">{status}</h2>
                  <span className="text-xs muted">{data.board[status].length}</span>
                </div>
                <p className="text-[0.6875rem] muted mt-0.5 leading-snug">{COLUMN_HINTS[status]}</p>
              </div>
              <div className="space-y-2">
                {data.board[status].map((item) => (
                  <DemandCard
                    key={item.id}
                    item={item}
                    draggable={canEdit}
                    onDragStart={() => setDragging(item)}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}
                {data.board[status].length === 0 && (
                  <div className="card card-pad text-center text-xs muted">Nothing here.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <p className="text-xs muted">
          Drag a card between columns to move it. Approve, Reject and Defer open the
          item first — each needs either a capacity check or a recorded reason.
        </p>
      )}

      {creating && (
        <RaiseDemandModal onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); }} />
      )}
    </div>
  );
}

function DemandCard({ item, draggable, onDragStart, onDragEnd }) {
  const sized = item.sizing_summary.tier2Complete;
  return (
    <Link
      to={`/demand/${item.id}`}
      className="card card-pad block"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ cursor: draggable ? 'grab' : 'pointer' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.8125rem] font-semibold leading-snug">{item.title}</span>
        {item.tshirt_size ? (
          <span
            className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[0.6875rem] font-bold"
            style={{ background: 'var(--series-1)', color: '#fff' }}
            title="Tier 1 t-shirt size"
          >
            {item.tshirt_size}
          </span>
        ) : (
          <span className="shrink-0 text-[0.6875rem] muted">unsized</span>
        )}
      </div>

      <div className="text-[0.6875rem] muted mt-1 capitalize">{item.source}</div>

      <div className="mt-2 text-[0.6875rem] space-y-0.5">
        {sized ? (
          <div className="secondary">
            <span className="font-semibold">{days(item.sizing_summary.adjustedDays)}</span> person-days
            {item.sizing_summary.multiplier > 1 && (
              <span className="muted">
                {' '}({days(item.sizing_summary.baselineDays)} × {item.sizing_summary.multiplier})
              </span>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--status-warning)' }}>▲ No Tier 2 estimate</div>
        )}
        {item.complexity_factors.length > 0 && (
          <div className="muted">
            {item.complexity_factors.length} complexity factor{item.complexity_factors.length > 1 ? 's' : ''}
          </div>
        )}
        {item.scheduled ? (
          <div className="muted">
            {dateShort(item.indicative_start_date)} → {dateShort(item.indicative_end_date)}
          </div>
        ) : (
          <div className="muted">No indicative window</div>
        )}
      </div>

      {item.linked_project_name && (
        <div className="mt-2 pt-2 text-[0.6875rem]" style={{ borderTop: '1px solid var(--gridline)' }}>
          <Pill tone="accent">→ {item.linked_project_name}</Pill>
        </div>
      )}
    </Link>
  );
}

function RaiseDemandModal({ onClose, onCreated }) {
  const { reference } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', source: 'business request', tshirt_size: '',
    indicative_start_date: '', indicative_end_date: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const bands = reference?.tshirtBands || [];

  return (
    <Modal title="Raise a demand item" onClose={onClose} width="42rem">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try {
            await api.post('/demand', form);
            onCreated();
          } catch (err) { setError(err); setBusy(false); }
        }}
      >
        <Field label="Title">
          <input className="field" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea className="field" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={form.source} onChange={(v) => setForm({ ...form, source: v })}
              options={reference?.demandSources || []} />
          </Field>
          <Field label="T-shirt size" hint="Optional at intake — leave blank to raise it as New.">
            <Select value={form.tshirt_size} onChange={(v) => setForm({ ...form, tshirt_size: v })}
              includeAll allLabel="Not sized yet"
              options={bands.map((b) => ({ value: b.size, label: `${b.size} — ${b.duration_label}` }))} />
          </Field>
          <Field label="Indicative start" hint="Needed before capacity can be tested.">
            <input className="field" type="date" value={form.indicative_start_date}
              onChange={(e) => setForm({ ...form, indicative_start_date: e.target.value })} />
          </Field>
          <Field label="Indicative end">
            <input className="field" type="date" value={form.indicative_end_date}
              onChange={(e) => setForm({ ...form, indicative_end_date: e.target.value })} />
          </Field>
        </div>

        {bands.length > 0 && (
          <div className="card card-pad">
            <div className="label mb-1.5">Tier 1 rubric</div>
            <div className="scroll-x">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Size</th><th>Duration</th><th>Indicative $</th>
                    <th>Systems</th><th className="num">Blended effort</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.size}>
                      <td className="font-semibold">{b.size}</td>
                      <td className="secondary">{b.duration_label}</td>
                      <td className="secondary">{b.amount_label}</td>
                      <td className="secondary">{b.systems_label}</td>
                      <td className="num secondary">
                        {b.effort_days_min}–{b.effort_days_max ?? '∞'} d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[0.6875rem] muted mt-2">
              These ranges are placeholders from the build brief. Calibrate them against
              historical projects before the early capacity numbers are trusted.
            </p>
          </div>
        )}

        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Raising…' : 'Raise item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
