import { NavLink } from 'react-router-dom';
import { ROLE_LABELS, useAuth } from '../lib/auth.jsx';

/**
 * Navigation is role-shaped (Section 2). A PM, a PSC member and a resourced
 * team member do not get the same tool with different rows hidden — they get
 * different entry points.
 */
const NAV = [
  { to: '/', label: 'Workbench', roles: ['admin', 'pm', 'biz_lead', 'psc'], end: true },
  { to: '/my-allocations', label: 'My allocations', roles: ['admin', 'pm', 'biz_lead', 'resource'] },
  { to: '/portfolio', label: 'Portfolio', roles: ['admin', 'pm', 'biz_lead', 'psc', 'resource'] },
  { to: '/rag', label: 'RAG', roles: ['admin', 'pm', 'biz_lead', 'psc'] },
  { to: '/budget', label: 'Budget', roles: ['admin', 'pm', 'biz_lead', 'psc'] },
  { to: '/capacity', label: 'Resourcing & capacity', roles: ['admin', 'pm', 'biz_lead', 'psc', 'resource'] },
  { to: '/demand', label: 'Demand intake', roles: ['admin', 'pm', 'biz_lead', 'psc'] },
  { to: '/psc-pack', label: 'PSC pack', roles: ['admin', 'pm', 'biz_lead', 'psc'] },
  { to: '/admin', label: 'Admin', roles: ['admin'] },
];

export function Layout({ children }) {
  const { user, person, logout, isDemo, personas, switchPersona } = useAuth();
  const items = NAV.filter((item) => item.roles.includes(user.accessRole));

  return (
    <div className="min-h-full flex flex-col">
      <header
        className="sticky top-0 z-40 no-print"
        style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-4 px-5 py-2.5">
          {/*
            On the published site the title doubles as the way back to the DBS
            dashboards index, matching the brand mark on the other dashboards:
            a relative "index.html" so it works from a copy as well as from
            GitHub Pages, where it resolves against the /DBS base. In the full
            application there is nothing above the workbench, so it behaves like
            an ordinary logo and returns to the home screen.
          */}
          {isDemo ? (
            <a
              href="index.html"
              title="Back to all dashboards"
              className="shrink-0 group"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div className="text-[0.9375rem] font-bold leading-tight group-hover:underline">
                GFM Delivery Workbench
              </div>
              <div className="text-[0.6875rem] leading-tight" style={{ color: 'var(--series-1)' }}>
                ← All DBS dashboards
              </div>
            </a>
          ) : (
            <NavLink
              to="/"
              end
              className="shrink-0"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div className="text-[0.9375rem] font-bold leading-tight">GFM Delivery Workbench</div>
              <div className="text-[0.6875rem] muted leading-tight">
                Portfolio, capacity and demand — one book of work
              </div>
            </NavLink>
          )}

          <nav className="flex flex-wrap items-center gap-0.5 ml-2">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="px-2.5 py-1.5 rounded-[7px] text-[0.8125rem] font-semibold"
                style={({ isActive }) => (isActive
                  ? { background: 'var(--series-1)', color: '#fff' }
                  : { color: 'var(--text-secondary)' })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold">{user.name}</div>
              <div className="text-[0.6875rem] muted">
                {ROLE_LABELS[user.accessRole]}
                {person ? ` · ${person.role}` : ''}
              </div>
            </div>
            {isDemo ? (
              /* The demo has no sign-in, so the switcher doubles as the clearest
                 way to show that the screens differ by role rather than by filter. */
              <label className="flex items-center gap-1.5">
                <span className="text-[0.6875rem] muted">View as</span>
                <select
                  className="field"
                  style={{ width: 'auto', paddingTop: '0.25rem', paddingBottom: '0.25rem' }}
                  value={user.id}
                  onChange={(e) => switchPersona(Number(e.target.value))}
                >
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <button type="button" className="btn btn-sm" onClick={logout}>Sign out</button>
            )}
          </div>
        </div>
      </header>

      {isDemo && (
        <div
          className="px-5 py-1.5 text-[0.6875rem] no-print"
          style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
        >
          <strong style={{ color: 'var(--status-warning)' }}>▲ Demo</strong>
          <span className="secondary">
            {' '}— fabricated portfolio, running entirely in this browser tab. Edits are real
            and move the numbers, but nothing is saved: reload to restore the seeded data.
          </span>
        </div>
      )}

      <main className="flex-1 px-5 py-4">{children}</main>

      <footer className="px-5 py-3 text-[0.6875rem] muted no-print">
        Demo dataset — every project, person and figure shown here is fabricated.
        Real portfolio data must not be entered until hosting and data governance
        are confirmed (see docs/ASSUMPTIONS.md).
      </footer>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-lg font-bold leading-tight">{title}</h1>
        {description && <p className="text-[0.8125rem] secondary mt-0.5 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}
