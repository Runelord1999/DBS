import { useState } from 'react';
import { PageHeader } from '../components/Layout.jsx';
import {
  Card, ErrorBanner, Field, Loading, Select,
} from '../components/ui.jsx';
import { useApi } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS } from '../lib/auth.jsx';

/**
 * Admin — the capacity assumptions, the sizing rubric and user access.
 *
 * These sit behind the admin role because every number here moves the whole
 * capacity model, which is exactly why they are editable rather than hardcoded.
 */
export default function Admin() {
  const { reference, reloadReference } = useAuth();
  const [error, setError] = useState(null);
  const { data: users, reload: reloadUsers } = useApi('/auth/users');
  const { data: people } = useApi('/people?active=');

  if (!reference) return <Loading />;

  const act = async (fn) => {
    setError(null);
    try { await fn(); await reloadReference(); } catch (err) { setError(err); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin"
        description="Capacity assumptions, the sizing rubric, RAG streams and user access. Changing anything here re-computes every capacity figure in the tool."
      />

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      <Card
        title="Capacity & governance assumptions"
        subtitle="Several of these are placeholders from the build brief — replace them with the real GFM figures."
        bodyClass=""
      >
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '20rem' }}>Assumption</th>
                <th style={{ width: '9rem' }}>Value</th>
                <th style={{ width: '5rem' }}>Unit</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {reference.assumptions.map((a) => (
                <tr key={a.key}>
                  <td>
                    <div className="font-medium">{a.label}</div>
                    <div className="text-[0.6875rem] muted">{a.key}</div>
                  </td>
                  <td>
                    <input
                      className="field num"
                      defaultValue={a.value}
                      onBlur={(e) => {
                        if (e.target.value === a.value) return;
                        act(() => api.put(`/reference/assumptions/${a.key}`, { value: e.target.value }));
                      }}
                    />
                  </td>
                  <td className="secondary text-xs">{a.unit || '—'}</td>
                  <td className="text-xs" style={{
                    color: a.description?.startsWith('PLACEHOLDER')
                      ? 'var(--status-warning)' : 'var(--text-secondary)',
                  }}>
                    {a.description?.startsWith('PLACEHOLDER') && '▲ '}{a.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Complexity factors"
          subtitle="Flat uplift per checked factor. Refine once there is estimate-vs-actual history."
          bodyClass=""
        >
          <div className="scroll-x">
            <table className="grid-table">
              <thead>
                <tr><th>Factor</th><th className="num" style={{ width: '7rem' }}>Uplift %</th></tr>
              </thead>
              <tbody>
                {reference.complexityFactors.map((f) => (
                  <tr key={f.key}>
                    <td>
                      <div className="font-medium">{f.label}</div>
                      <div className="text-[0.6875rem] muted">{f.description}</div>
                    </td>
                    <td>
                      <input
                        className="field num" type="number" min="0" step="1"
                        defaultValue={f.uplift_pct}
                        onBlur={(e) => {
                          if (Number(e.target.value) === f.uplift_pct) return;
                          act(() => api.put(`/reference/complexity-factors/${f.key}`,
                            { uplift_pct: Number(e.target.value) }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="RAG streams"
          subtitle="The placeholder list from the brief — replace with the streams GFM actually tracks."
          bodyClass=""
        >
          <div className="scroll-x">
            <table className="grid-table">
              <thead>
                <tr><th>Stream</th><th style={{ width: '6rem' }}>Active</th></tr>
              </thead>
              <tbody>
                {reference.streams.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <input
                        className="field"
                        defaultValue={s.label}
                        onBlur={(e) => {
                          if (e.target.value === s.label) return;
                          act(() => api.patch(`/reference/streams/${s.key}`, { label: e.target.value }));
                        }}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm"
                        onClick={() => act(() => api.patch(`/reference/streams/${s.key}`, { active: 0 }))}>
                        Retire
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddStream onAdd={(body) => act(() => api.post('/reference/streams', body))} />
        </Card>
      </div>

      <Card
        title="Tier 1 t-shirt bands"
        subtitle="Placeholder ranges. Calibrate against historical projects, then mark them calibrated."
        bodyClass=""
      >
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th style={{ width: '4rem' }}>Size</th>
                <th style={{ width: '10rem' }}>Duration</th>
                <th style={{ width: '14rem' }}>Indicative $</th>
                <th className="num" style={{ width: '7rem' }}>Effort min</th>
                <th className="num" style={{ width: '7rem' }}>Effort max</th>
                <th style={{ width: '7rem' }}>Calibrated</th>
              </tr>
            </thead>
            <tbody>
              {reference.tshirtBands.map((b) => (
                <tr key={b.size}>
                  <td className="font-semibold">{b.size}</td>
                  <td className="secondary">{b.duration_label}</td>
                  <td className="secondary">{b.amount_label}</td>
                  <td>
                    <input className="field num" type="number" defaultValue={b.effort_days_min}
                      onBlur={(e) => {
                        if (Number(e.target.value) === b.effort_days_min) return;
                        act(() => api.put(`/reference/tshirt-bands/${b.size}`,
                          { effort_days_min: Number(e.target.value) }));
                      }} />
                  </td>
                  <td>
                    <input className="field num" type="number" defaultValue={b.effort_days_max ?? ''}
                      onBlur={(e) => {
                        const next = e.target.value === '' ? null : Number(e.target.value);
                        if (next === b.effort_days_max) return;
                        act(() => api.put(`/reference/tshirt-bands/${b.size}`, { effort_days_max: next }));
                      }} />
                  </td>
                  <td>
                    {b.calibrated ? (
                      <span className="text-xs" style={{ color: 'var(--success-text)' }}>● Calibrated</span>
                    ) : (
                      <button type="button" className="btn btn-sm"
                        onClick={() => act(() => api.put(`/reference/tshirt-bands/${b.size}`,
                          { calibrated: 1 }))}>
                        Mark done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Users & access" subtitle="Who can sign in, and what they can do." bodyClass="">
        <div className="scroll-x" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <table className="grid-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th>
                <th style={{ width: '13rem' }}>Access role</th>
                <th style={{ width: '13rem' }}>Linked person</th>
                <th style={{ width: '6rem' }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="secondary text-xs">{u.email}</td>
                  <td>
                    <Select
                      value={u.access_role}
                      options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
                      onChange={(v) => act(async () => {
                        await api.patch(`/auth/users/${u.id}`, { access_role: v });
                        await reloadUsers();
                      })}
                    />
                  </td>
                  <td>
                    <Select
                      value={u.person_id ? String(u.person_id) : ''}
                      includeAll allLabel="Not linked"
                      options={(people || []).map((p) => ({
                        value: String(p.id), label: `${p.name} (${p.role})`,
                      }))}
                      onChange={(v) => act(async () => {
                        await api.patch(`/auth/users/${u.id}`, { person_id: v ? Number(v) : null });
                        await reloadUsers();
                      })}
                    />
                  </td>
                  <td>
                    <button type="button" className={`btn btn-sm ${u.active ? '' : 'btn-primary'}`}
                      onClick={() => act(async () => {
                        await api.patch(`/auth/users/${u.id}`, { active: !u.active });
                        await reloadUsers();
                      })}>
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
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

function AddStream({ onAdd }) {
  const [form, setForm] = useState({ key: '', label: '' });
  return (
    <form
      className="flex flex-wrap items-end gap-2 p-3"
      style={{ borderTop: '1px solid var(--gridline)' }}
      onSubmit={(e) => { e.preventDefault(); onAdd(form); setForm({ key: '', label: '' }); }}
    >
      <Field label="New stream key" className="w-40">
        <input className="field" required value={form.key} placeholder="e.g. data_migration"
          onChange={(e) => setForm({ ...form, key: e.target.value })} />
      </Field>
      <Field label="Label" className="flex-1 min-w-40">
        <input className="field" required value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Field>
      <button type="submit" className="btn btn-primary">Add</button>
    </form>
  );
}
