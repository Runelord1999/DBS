import { useEffect, useRef, useState } from 'react';
import { Legend, useTooltip } from './ui.jsx';
import { days, pct } from '../lib/format.js';

/** Renders at the container's real pixel width so axis text stays crisp. */
function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const PLOT_HEIGHT = 150;
const AXIS_BAND = 34;
const TOP_PAD = 16;
const LEFT_AXIS = 34;

/**
 * The Section 4 numbers, as small multiples — one panel per role, one shared
 * scale, one ceiling rule at 100%.
 *
 * Committed and pipeline are two *series* (identity), so they take categorical
 * slots 1 and 2. Whether a bar is over the ceiling is a *state*, carried by the
 * status chip and the direct label beside the breaching bar — never by
 * repainting the series colour.
 */
export function CapacityChart({ capacity, showPipeline = true }) {
  const tooltip = useTooltip();

  const peak = capacity.roles.reduce((max, role) => role.periods.reduce(
    (m, cell) => Math.max(m, Number.isFinite(cell.utilizationPct) ? cell.utilizationPct : 0), max
  ), 0);
  // Keep the ceiling comfortably inside the plot without stranding the bars at
  // the bottom of an over-tall axis.
  const yMax = Math.max(125, Math.ceil(peak / 25) * 25);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend items={[
          { label: 'Committed (approved projects)', color: 'var(--series-1)' },
          ...(showPipeline ? [{ label: 'Pipeline (sized, not yet approved)', color: 'var(--series-2)' }] : []),
          { label: 'Capacity ceiling (100%)', color: 'var(--text-secondary)', rule: true },
        ]} />
        <span className="text-xs muted">
          Utilisation = demand ÷ capacity, by role, by quarter.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {capacity.roles.map((role) => (
          <RolePanel
            key={role.role}
            role={role}
            yMax={yMax}
            showPipeline={showPipeline}
            tooltip={tooltip}
          />
        ))}
      </div>
      {tooltip.node}
    </div>
  );
}

function RolePanel({ role, yMax, showPipeline, tooltip }) {
  const [ref, width] = useMeasure();
  const plotWidth = Math.max(0, width - LEFT_AXIS - 8);
  const height = TOP_PAD + PLOT_HEIGHT + AXIS_BAND;

  const worst = role.periods.reduce(
    (best, cell) => (cell.utilizationPct > (best?.utilizationPct ?? -1) ? cell : best),
    null
  );
  const breaches = role.periods.some((c) => c.status === 'red' || c.totalStatus === 'red');

  const y = (value) => TOP_PAD + PLOT_HEIGHT - (Math.min(value, yMax) / yMax) * PLOT_HEIGHT;
  const slot = role.periods.length ? plotWidth / role.periods.length : plotWidth;
  const barWidth = Math.max(6, Math.min(38, slot * 0.58));
  const ticks = [];
  for (let v = 0; v <= yMax; v += 25) ticks.push(v);

  return (
    <div className="card card-pad">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="card-title">{role.role}</h3>
        <span className="text-xs muted">{role.headcount} people</span>
      </div>
      <p className="card-subtitle mt-0.5">
        Peak{' '}
        <span
          className="font-semibold"
          style={{ color: breaches ? 'var(--status-critical)' : 'var(--text-secondary)' }}
        >
          {pct(worst?.utilizationPct ?? 0)}
        </span>{' '}
        in {worst?.periodLabel ?? '—'}
      </p>

      <div ref={ref} className="mt-2">
        {width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label={`${role.role} capacity utilisation by quarter`}>
            {/* gridlines — solid hairlines, one shade off the surface */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT_AXIS} x2={width - 8} y1={y(tick)} y2={y(tick)}
                  stroke={tick === 100 ? 'var(--text-secondary)' : 'var(--gridline)'}
                  strokeWidth={tick === 100 ? 1.5 : 1}
                />
                <text
                  x={LEFT_AXIS - 6} y={y(tick) + 3.5} textAnchor="end"
                  fontSize="9.5" fill="var(--text-muted)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {tick}
                </text>
              </g>
            ))}

            {role.periods.map((cell, i) => {
              const cx = LEFT_AXIS + slot * i + slot / 2;
              const x = cx - barWidth / 2;
              const committedTop = y(cell.committedUtilizationPct);
              const committedHeight = Math.max(0, y(0) - committedTop);
              const pipelinePct = showPipeline
                ? Math.max(0, Math.min(cell.utilizationPct, yMax) - Math.min(cell.committedUtilizationPct, yMax))
                : 0;
              const pipelineHeight = (pipelinePct / yMax) * PLOT_HEIGHT;
              // 2px surface gap between stacked segments, never a border.
              const gap = pipelineHeight > 3 && committedHeight > 3 ? 2 : 0;
              const isWorst = worst && cell.key === worst.key;
              const overCeiling = cell.status === 'red' || cell.totalStatus === 'red';

              return (
                <g
                  key={cell.key}
                  onMouseEnter={(e) => tooltip.show(e, <CapacityTip role={role.role} cell={cell} />)}
                  onMouseMove={tooltip.move}
                  onMouseLeave={tooltip.hide}
                  tabIndex={0}
                  onFocus={(e) => tooltip.show(
                    { clientX: e.target.getBoundingClientRect().left, clientY: e.target.getBoundingClientRect().top },
                    <CapacityTip role={role.role} cell={cell} />
                  )}
                  onBlur={tooltip.hide}
                  style={{ cursor: 'default' }}
                >
                  {/* generous hit area, larger than the mark */}
                  <rect
                    x={cx - slot / 2} y={TOP_PAD} width={slot} height={PLOT_HEIGHT}
                    fill="transparent"
                  />
                  {committedHeight > 0 && (
                    <rect
                      x={x} y={committedTop} width={barWidth} height={committedHeight}
                      rx="3" fill="var(--series-1)"
                    />
                  )}
                  {pipelineHeight > 0 && (
                    <rect
                      x={x}
                      y={committedTop - pipelineHeight}
                      width={barWidth}
                      height={Math.max(0, pipelineHeight - gap)}
                      rx="3"
                      fill="var(--series-2)"
                    />
                  )}
                  {/* Direct-label only the peak bar — never a number on every bar. */}
                  {isWorst && (
                    <text
                      x={cx}
                      y={Math.max(11, y(Math.min(cell.utilizationPct, yMax)) - (pipelineHeight > 0 ? 6 : 5))}
                      textAnchor="middle" fontSize="10" fontWeight="650"
                      fill={overCeiling ? 'var(--status-critical)' : 'var(--text-secondary)'}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {pct(cell.utilizationPct)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* baseline */}
            <line
              x1={LEFT_AXIS} x2={width - 8} y1={y(0)} y2={y(0)}
              stroke="var(--baseline)" strokeWidth="1"
            />

            {role.periods.map((cell, i) => (
              <text
                key={cell.key}
                x={LEFT_AXIS + slot * i + slot / 2}
                y={y(0) + 14}
                textAnchor="middle" fontSize="9.5" fill="var(--text-muted)"
              >
                {cell.periodLabel.replace('FY', '')}
              </text>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

function CapacityTip({ role, cell }) {
  return (
    <div>
      <div className="font-semibold">{role} · {cell.periodLabel}</div>
      <div className="muted text-[0.6875rem]">{cell.start} → {cell.end}</div>
      <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <dt className="secondary">Capacity</dt>
        <dd className="num">{days(cell.capacityDays)} d</dd>
        <dt className="secondary">Committed</dt>
        <dd className="num">{days(cell.allocatedDays)} d · {pct(cell.committedUtilizationPct)}</dd>
        <dt className="secondary">Pipeline</dt>
        <dd className="num">{days(cell.pipelineDays)} d</dd>
        <dt className="secondary">Remaining</dt>
        <dd className="num" style={{ color: cell.remainingDays < 0 ? 'var(--status-critical)' : undefined }}>
          {days(cell.remainingDays)} d
        </dd>
      </dl>
    </div>
  );
}

/** The table-view twin. Every value on the chart is reachable here too. */
export function CapacityTable({ capacity }) {
  return (
    <div className="scroll-x">
      <table className="grid-table">
        <thead>
          <tr>
            <th>Role</th>
            <th className="num">People</th>
            <th>Period</th>
            <th className="num">Capacity (d)</th>
            <th className="num">Committed (d)</th>
            <th className="num">Pipeline (d)</th>
            <th className="num">Remaining (d)</th>
            <th className="num">Committed %</th>
            <th className="num">Incl. pipeline %</th>
          </tr>
        </thead>
        <tbody>
          {capacity.roles.flatMap((role) => role.periods.map((cell, i) => (
            <tr key={`${role.role}-${cell.key}`}>
              <td className="font-medium">{i === 0 ? role.role : ''}</td>
              <td className="num muted">{i === 0 ? role.headcount : ''}</td>
              <td>{cell.periodLabel}</td>
              <td className="num">{days(cell.capacityDays)}</td>
              <td className="num">{days(cell.allocatedDays)}</td>
              <td className="num">{days(cell.pipelineDays)}</td>
              <td className="num" style={{ color: cell.remainingDays < 0 ? 'var(--status-critical)' : undefined }}>
                {days(cell.remainingDays)}
              </td>
              <td className="num font-semibold"
                style={{ color: cell.status === 'red' ? 'var(--status-critical)' : undefined }}>
                {pct(cell.committedUtilizationPct)}
              </td>
              <td className="num"
                style={{ color: cell.totalStatus === 'red' ? 'var(--status-critical)' : undefined }}>
                {pct(cell.utilizationPct)}
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
