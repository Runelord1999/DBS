import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Loading, Pill, Select, StatusChip,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { date, days, pct } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * One demand item: the full sizing rubric (Section 6) and the capacity impact
 * (Section 4.5), both on screen before the Approve button is reachable.
 */
export default function DemandDetail() {
  const { id } = useParams();
  const { reference, canEdit } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(`/demand/${id}`, [id]);
  const [actionError, setActionError] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const { item, sizing, readiness, capacityCheck } = data;
  const act = async (fn) => {
    setActionError(null);
    try { await fn(); await reload(); } catch (err) { setActionError(err); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={item.title}
        description={item.description}
        actions={<Link to="/demand" className="btn btn-sm">Back to queue</Link>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="accent">{item.status}</Pill>
        <Pill>{item.source}</Pill>
        {item.tshirt_size && <Pill>Tier 1: {item.tshirt_size}</Pill>}
        <span className="text-xs muted">
          Raised {date(item.date_raised)} by {item.requested_by || 'unknown'}
        </span>
        {item.linked_project_name && (
          <Link to={`/projects/${item.linked_project_id}`} className="text-xs font-semibold"
            style={{ color: 'var(--series-1)' }}>
            → {item.linked_project_name}
          </Link>
        )}
      </div>

      {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

      {item.decision_note && (
        <Card title="Decision">
          <p className="text-[0.8125rem] secondary">{item.decision_note}</p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Tier1 item={item} sizing={sizing} reference={reference} canEdit={canEdit} act={act} />
          <Tier2 item={item} sizing={sizing} reference={reference} canEdit={canEdit} act={act} />
          <Complexity item={item} sizing={sizing} reference={reference} canEdit={canEdit} act={act} />
        </div>

        <div className="space-y-4">
          <Window item={item} canEdit={canEdit} act={act} />
          <CapacityImpact check={capacityCheck} />
          <Decision
            item={item}
            readiness={readiness}
            check={capacityCheck}
            canEdit={canEdit}
            act={act}
            onApproved={(projectId) => navigate(`/projects/${projectId}`)}
            setActionError={setActionError}
          />
        </div>
      </div>
    </div>
  );
}

function Tier1({ item, sizing, reference, canEdit, act }) {
  const bands = reference?.tshirtBands || [];
  return (
    <Card
      title="Tier 1 — t-shirt size"
      subtitle="Applied at intake. Fast enough not to block, rough enough only to decide whether detailed sizing is worth it."
    >
      {canEdit && (
        <div className="mb-3 max-w-xs">
          <Field label="Size">
            <Select
              value={item.tshirt_size || ''}
              onChange={(v) => act(() => api.patch(`/demand/${item.id}`, { tshirt_size: v || null }))}
              includeAll allLabel="Not sized yet"
              options={bands.map((b) => ({ value: b.size, label: `${b.size} — ${b.duration_label}` }))}
            />
          </Field>
        </div>
      )}

      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Size</th><th>Duration</th><th>Indicative $</th>
              <th>Systems / streams</th><th className="num">Blended effort</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.size} style={b.size === item.tshirt_size
                ? { background: 'var(--hover-wash)' } : undefined}>
                <td className="font-semibold">
                  {b.size}{b.size === item.tshirt_size && ' ←'}
                </td>
                <td className="secondary">{b.duration_label}</td>
                <td className="secondary">{b.amount_label}</td>
                <td className="secondary">{b.systems_label}</td>
                <td className="num secondary">{b.effort_days_min}–{b.effort_days_max ?? '∞'} d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sizing.tier1.consistency.checked && !sizing.tier1.consistency.agrees && (
        <p className="text-[0.8125rem] mt-3" style={{ color: 'var(--status-warning)' }}>
          ▲ {sizing.tier1.consistency.message}
        </p>
      )}
    </Card>
  );
}

function Tier2({ item, sizing, reference, canEdit, act }) {
  const phases = reference?.phases || [];
  const roles = reference?.roles || [];
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  // Rebuild the editable grid whenever the saved sizing changes.
  const saved = useMemo(() => {
    const grid = {};
    for (const row of sizing.tier2.rows) {
      grid[row.role] = { ...row.phases };
    }
    return grid;
  }, [sizing]);

  useEffect(() => { setDraft(null); }, [saved]);
  const grid = draft ?? saved;

  const setCell = (role, phase, value) => {
    setDraft({
      ...grid,
      [role]: { ...grid[role], [phase]: value === '' ? 0 : Number(value) },
    });
  };

  const save = () => {
    setBusy(true);
    const estimates = [];
    for (const role of roles) {
      for (const phase of phases) {
        const value = Number(grid[role]?.[phase.key] || 0);
        if (value > 0) estimates.push({ role, phase: phase.key, estimated_person_days: value });
      }
    }
    act(async () => {
      await api.put(`/demand/${item.id}/sizing`, { estimates });
      setDraft(null);
    }).finally(() => setBusy(false));
  };

  const roleTotal = (role) => phases.reduce((sum, p) => sum + Number(grid[role]?.[p.key] || 0), 0);
  const phaseTotal = (phase) => roles.reduce((sum, r) => sum + Number(grid[r]?.[phase] || 0), 0);
  const grandTotal = roles.reduce((sum, r) => sum + roleTotal(r), 0);

  return (
    <Card
      title="Tier 2 — effort by role and phase"
      subtitle="Person-days. Mandatory before approval: a t-shirt size cannot be tested against capacity by role."
      actions={canEdit && draft && (
        <>
          <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>Discard</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save estimate'}
          </button>
        </>
      )}
    >
      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Role</th>
              {phases.map((p) => <th key={p.key} className="num">{p.label}</th>)}
              <th className="num">Baseline</th>
              <th className="num">Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const base = roleTotal(role);
              const adjusted = base * (sizing.complexity.multiplier || 1);
              return (
                <tr key={role}>
                  <td className="font-medium">{role}</td>
                  {phases.map((p) => (
                    <td key={p.key} className="num">
                      {canEdit ? (
                        <input
                          className="field num"
                          type="number" min="0" step="0.5"
                          value={grid[role]?.[p.key] || ''}
                          placeholder="0"
                          onChange={(e) => setCell(role, p.key, e.target.value)}
                        />
                      ) : (grid[role]?.[p.key] || '—')}
                    </td>
                  ))}
                  <td className="num secondary">{base ? days(base) : '—'}</td>
                  <td className="num font-semibold">{base ? days(adjusted) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td className="font-semibold">Total</td>
              {phases.map((p) => (
                <td key={p.key} className="num font-semibold">{days(phaseTotal(p.key))}</td>
              ))}
              <td className="num font-semibold">{days(grandTotal)}</td>
              <td className="num font-semibold">
                {days(grandTotal * (sizing.complexity.multiplier || 1))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {draft && (
        <p className="text-xs mt-2" style={{ color: 'var(--status-warning)' }}>
          ▲ Unsaved changes — the capacity impact still reflects the saved estimate.
        </p>
      )}
    </Card>
  );
}

function Complexity({ item, sizing, reference, canEdit, act }) {
  const factors = reference?.complexityFactors || [];
  const applied = new Set(sizing.complexity.factors.map((f) => f.key));

  const toggle = (key) => {
    const next = new Set(applied);
    if (next.has(key)) next.delete(key); else next.add(key);
    act(() => api.put(`/demand/${item.id}/complexity`, { factors: [...next] }));
  };

  return (
    <Card
      title="Complexity adjustment"
      subtitle="A visible checklist, not a black-box multiplier. Factors only ever move an estimate up."
    >
      <div className="space-y-2">
        {factors.map((factor) => (
          <label key={factor.key} className="flex items-start gap-2.5 text-[0.8125rem]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={applied.has(factor.key)}
              disabled={!canEdit}
              onChange={() => toggle(factor.key)}
            />
            <span>
              <span className="font-medium">{factor.label}</span>
              <span className="muted"> +{factor.uplift_pct}%</span>
              <span className="block text-[0.6875rem] muted">{factor.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--gridline)' }}>
        <div className="text-[0.8125rem] space-y-1">
          <div className="flex justify-between">
            <span className="secondary">Baseline (Tier 2 total)</span>
            <span className="num">{days(sizing.complexity.baselineTotalDays)} person-days</span>
          </div>
          <div className="flex justify-between">
            <span className="secondary">
              Uplift{sizing.complexity.factors.length > 0 && (
                <span className="muted">
                  {' '}({sizing.complexity.factors.map((f) => `+${f.uplift_pct}%`).join(' ')})
                </span>
              )}
            </span>
            <span className="num">
              +{sizing.complexity.totalUpliftPct}% = {days(sizing.complexity.upliftDays)} days
            </span>
          </div>
          <div className="flex justify-between font-semibold pt-1"
            style={{ borderTop: '1px solid var(--gridline)' }}>
            <span>Adjusted total</span>
            <span className="num">{days(sizing.complexity.adjustedTotalDays)} person-days</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Window({ item, canEdit, act }) {
  return (
    <Card
      title="Indicative delivery window"
      subtitle="Without dates the capacity impact cannot be placed in a period."
    >
      {canEdit ? (
        <div className="space-y-2">
          <Field label="Start">
            <input className="field" type="date" defaultValue={item.indicative_start_date || ''}
              onBlur={(e) => e.target.value !== (item.indicative_start_date || '') && act(
                () => api.patch(`/demand/${item.id}`, { indicative_start_date: e.target.value || null })
              )} />
          </Field>
          <Field label="End">
            <input className="field" type="date" defaultValue={item.indicative_end_date || ''}
              onBlur={(e) => e.target.value !== (item.indicative_end_date || '') && act(
                () => api.patch(`/demand/${item.id}`, { indicative_end_date: e.target.value || null })
              )} />
          </Field>
        </div>
      ) : (
        <p className="text-[0.8125rem] secondary">
          {item.indicative_start_date
            ? `${date(item.indicative_start_date)} → ${date(item.indicative_end_date)}`
            : 'Not set.'}
        </p>
      )}
    </Card>
  );
}

function CapacityImpact({ check }) {
  if (!check.testable) {
    return (
      <Card title="Capacity impact">
        <p className="text-[0.8125rem]" style={{ color: 'var(--status-warning)' }}>
          ▲ {check.reason}
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Capacity impact"
      subtitle={`If approved for ${check.window.from} → ${check.window.to}.`}
    >
      <div className="mb-3">
        {check.verdict.fits ? (
          <StatusChip status="green" label="Fits within capacity" size="md" />
        ) : (
          <StatusChip status="red" label="Breaks the ceiling" size="md" />
        )}
      </div>

      <div className="scroll-x">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Role</th><th>Period</th>
              <th className="num">Needs</th>
              <th className="num">Before</th>
              <th className="num">After</th>
            </tr>
          </thead>
          <tbody>
            {check.roles.flatMap((role) => role.periods.map((cell, i) => (
              <tr key={`${role.role}-${cell.periodKey}`}>
                <td className="font-medium">{i === 0 ? role.role : ''}</td>
                <td className="secondary">{cell.periodLabel}</td>
                <td className="num">{days(cell.requiredDays)} d</td>
                <td className="num secondary">{pct(cell.utilizationBeforePct)}</td>
                <td className="num font-semibold"
                  style={{ color: cell.breach ? 'var(--status-critical)' : undefined }}>
                  {pct(cell.utilizationAfterPct)}
                  {cell.breach && ' ■'}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {!check.verdict.fits && (
        <p className="text-xs mt-2 secondary">
          Approving anyway is allowed, but it has to be an explicit decision with a
          recorded reason — it will not be absorbed silently.
        </p>
      )}
    </Card>
  );
}

function Decision({ item, readiness, check, canEdit, act, onApproved, setActionError }) {
  const [note, setNote] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canEdit) {
    return (
      <Card title="Decision">
        <p className="text-[0.8125rem] muted">
          Read-only — moving demand items is a PM, Biz Lead or admin action.
        </p>
      </Card>
    );
  }

  const approveGate = readiness.canMoveTo.Approved;
  const alreadyDecided = ['Approved', 'Rejected'].includes(item.status);

  const approve = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api.post(`/demand/${item.id}/approve`, {
        decision_note: note || null,
        acknowledge_capacity_breach: acknowledge,
      });
      onApproved(result.project.id);
    } catch (err) {
      setActionError(err);
      setBusy(false);
    }
  };

  return (
    <Card title="Decision" subtitle={`Currently ${item.status}.`}>
      {alreadyDecided ? (
        <p className="text-[0.8125rem] muted">This item has been decided.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {['New', 'T-Shirt Sized', 'Triage'].filter((s) => s !== item.status).map((status) => (
              <button
                key={status}
                type="button"
                className="btn btn-sm"
                disabled={!readiness.canMoveTo[status].allowed}
                title={readiness.canMoveTo[status].blockers.join(' ')}
                onClick={() => act(() => api.put(`/demand/${item.id}/status`, { status }))}
              >
                Move to {status}
              </button>
            ))}
          </div>

          <Field label="Decision note" hint="Required to reject or defer.">
            <textarea className="field" rows={3} value={note}
              onChange={(e) => setNote(e.target.value)} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!note.trim()}
              onClick={() => act(() => api.put(`/demand/${item.id}/status`,
                { status: 'Deferred', decision_note: note }))}
            >
              Defer
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={!note.trim()}
              onClick={() => act(() => api.put(`/demand/${item.id}/status`,
                { status: 'Rejected', decision_note: note }))}
            >
              Reject
            </button>
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid var(--gridline)' }}>
            {!approveGate.allowed && (
              <ul className="text-xs mb-2 space-y-0.5" style={{ color: 'var(--status-warning)' }}>
                {approveGate.blockers.map((b) => <li key={b}>▲ {b}</li>)}
              </ul>
            )}
            {check.testable && !check.verdict.fits && (
              <label className="flex items-start gap-2 text-[0.8125rem] mb-2">
                <input type="checkbox" className="mt-0.5" checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)} />
                <span>
                  I accept that approving this breaks the capacity ceiling in
                  {' '}{check.verdict.breaches.length} role/period combination(s).
                </span>
              </label>
            )}
            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              disabled={!approveGate.allowed || busy
                || (check.testable && !check.verdict.fits && !acknowledge)}
              onClick={approve}
            >
              {busy ? 'Approving…' : 'Approve → create project'}
            </button>
            <p className="text-[0.6875rem] muted mt-2">
              Approval creates the project, a budget line, and one unassigned
              allocation per sized role — so the capacity number moves immediately.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
