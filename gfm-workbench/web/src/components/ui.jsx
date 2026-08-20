import { useEffect, useState } from 'react';
import { STATUS_ICON, STATUS_VAR } from '../lib/format.js';

export function Card({ title, subtitle, actions, children, className = '', bodyClass = 'card-pad' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4.5 pt-3.5 pb-2.5"
          style={{ paddingLeft: '1.125rem', paddingRight: '1.125rem' }}>
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0 no-print">{actions}</div>}
        </header>
      )}
      <div className={title ? bodyClass.replace('card-pad', 'px-4.5 pb-4') : bodyClass}
        style={title ? { paddingLeft: '1.125rem', paddingRight: '1.125rem', paddingBottom: '1rem' } : undefined}>
        {children}
      </div>
    </section>
  );
}

/**
 * A hero number. Section 7's home screen is a set of these — a single figure is
 * a stat tile, not a one-bar bar chart.
 */
export function StatTile({ label, value, unit, hint, status, emphasis = false }) {
  return (
    <div className="card card-pad flex flex-col justify-between min-h-[6.5rem]">
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span
          className={emphasis ? 'text-4xl font-semibold leading-none' : 'text-3xl font-semibold leading-none'}
          style={status ? { color: STATUS_VAR[status] } : undefined}
        >
          {value}
        </span>
        {unit && <span className="text-sm secondary">{unit}</span>}
      </div>
      {hint && <div className="text-xs muted mt-2 leading-snug">{hint}</div>}
    </div>
  );
}

/**
 * Status is never colour alone — every chip carries a glyph and the word.
 * That is the mitigation for the two status tokens that sit below 3:1 on the
 * light surface.
 */
export function StatusChip({ status, label, size = 'sm' }) {
  if (!status) return <span className="muted text-xs">—</span>;
  const text = label ?? (typeof status === 'string' ? status : '');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === 'sm' ? 'text-[0.6875rem] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
      }`}
      style={{
        color: STATUS_VAR[status],
        border: `1px solid ${STATUS_VAR[status]}`,
      }}
    >
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      <span className="capitalize">{text}</span>
    </span>
  );
}

export function Pill({ children, tone = 'default' }) {
  const styles = tone === 'accent'
    ? { color: 'var(--series-1)', borderColor: 'var(--series-1)' }
    : { color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' };
  return (
    <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.6875rem] font-semibold"
      style={styles}>
      {children}
    </span>
  );
}

/** Chart legend. Always present for two or more series. */
export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs secondary">
          {/* A reference rule is drawn as a rule, a series as a swatch — the
              legend has to look like the mark it stands for. */}
          <span
            aria-hidden="true"
            className="inline-block rounded-[2px]"
            style={{
              width: item.rule ? 14 : 10,
              height: item.rule ? 2 : 10,
              background: item.color,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function Toolbar({ children }) {
  return (
    <div className="card card-pad flex flex-wrap items-end gap-3 no-print">
      {children}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[0.6875rem] muted mt-1">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, includeAll, allLabel = 'All', ...rest }) {
  return (
    <select
      className="field"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {includeAll && <option value="">{allLabel}</option>}
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const text = typeof opt === 'string' ? opt : opt.label;
        return <option key={val} value={val}>{text}</option>;
      })}
    </select>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="p-8 text-center text-sm muted">{label}</div>;
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;
  return (
    <div
      className="card card-pad text-sm"
      style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="font-semibold">{error.message || String(error)}</strong>
          {details && (
            <ul className="list-disc ml-4 mt-1.5 space-y-0.5">
              {details.map((d) => <li key={typeof d === 'string' ? d : JSON.stringify(d)}>
                {typeof d === 'string' ? d : JSON.stringify(d)}
              </li>)}
            </ul>
          )}
        </div>
        {onDismiss && (
          <button type="button" className="btn btn-sm shrink-0" onClick={onDismiss}>Dismiss</button>
        )}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="p-8 text-center text-sm muted">{children}</div>;
}

/** Every chart ships a table-view twin; this is the toggle for it. */
export function ViewToggle({ view, onChange, options = ['Chart', 'Table'] }) {
  return (
    <div className="inline-flex rounded-[7px] border overflow-hidden no-print"
      style={{ borderColor: 'var(--border-strong)' }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className="px-2.5 py-1 text-xs font-semibold"
          style={view === option
            ? { background: 'var(--series-1)', color: '#fff' }
            : { color: 'var(--text-secondary)' }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, width = '38rem' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card my-8 w-full" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between border-b px-4 py-3 hairline">
          <h2 className="card-title">{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** Shared hover-tooltip plumbing for the hand-rolled SVG charts. */
export function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = (event, content) => {
    setTip({ content, x: event.clientX, y: event.clientY });
  };
  const move = (event) => {
    setTip((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  };
  const hide = () => setTip(null);

  const node = tip ? (
    <div
      className="viz-tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 290),
        top: Math.min(tip.y + 14, window.innerHeight - 150),
      }}
    >
      {tip.content}
    </div>
  ) : null;

  return { show, move, hide, node };
}
