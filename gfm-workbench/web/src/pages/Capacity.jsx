import { useMemo, useState } from 'react';
import { PageHeader } from '../components/Layout.jsx';
import { CapacityChart, CapacityTable } from '../components/CapacityChart.jsx';
import {
  Card, ErrorBanner, Field, Loading, Select, StatusChip, Toolbar, ViewToggle,
} from '../components/ui.jsx';
import { useApi, query } from '../lib/useApi.js';
import { downloadCsv } from '../lib/api.js';
import { days, pct } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * The Resourcing & Capacity screen — the centrepiece (Section 4).
 *
 * This is the screen built to answer "can we take this on", so the ceiling,
 * what is already committed against it, and what is queued behind it all have
 * to be visible at once.
 */
export default function Capacity() {
  const { reference } = useAuth();
  const [granularity, setGranularity] = useState('quarter');
  const [includePipeline, setIncludePipeline] = useState(true);
  const [includeOnHold, setIncludeOnHold] = useState(false);
  const [view, setView] = useState('Chart');

  const params = query({ granularity, includePipeline, includeOnHold });
  const { data, error, loading, stale } = useApi(
    `/capacity${params}`,
    [granularity, includePipeline, includeOnHold]
  );

  const committedBreaches = useMemo(
    () => (data?.breaches || []).filter((b) => b.committedOnly),
    [data]
  );
  const pipelineBreaches = useMemo(
    () => (data?.breaches || []).filter((b) => !b.committedOnly),
    [data]
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBanner error={error} />;

  const assumed = data.assumptions;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Resourcing & capacity"
        description={
          `Capacity is ${assumed.effectiveDaysPerYear} effective delivery days per person per year, ` +
          'pro-rated onto each period. Demand is the sum of allocations, scaled the same way — so a ' +
          'full-time allocation for a year consumes exactly one person-year.'
        }
        actions={
          <button type="button" className="btn btn-sm"
            onClick={() => downloadCsv(`/export/capacity${params}`, 'gfm-capacity.csv')}>
            Export CSV
          </button>
        }
      />

      {/* One filter row above everything it scopes. */}
      <Toolbar>
        <Field label="Period" className="w-40">
          <Select
            value={granularity}
            onChange={setGranularity}
            options={[
              { value: 'month', label: 'Monthly' },
              { value: 'quarter', label: 'Quarterly' },
              { value: 'year', label: 'Fiscal year' },
            ]}
          />
        </Field>
        <label className="flex items-center gap-2 text-[0.8125rem] pb-1.5">
          <input type="checkbox" checked={includePipeline}
            onChange={(e) => setIncludePipeline(e.target.checked)} />
          Include unapproved pipeline demand
        </label>
        <label className="flex items-center gap-2 text-[0.8125rem] pb-1.5">
          <input type="checkbox" checked={includeOnHold}
            onChange={(e) => setIncludeOnHold(e.target.checked)} />
          Count on-hold projects as committed
        </label>
        <div className="ml-auto pb-0.5">
          <ViewToggle view={view} onChange={setView} />
        </div>
      </Toolbar>

      {committedBreaches.length > 0 && (
        <Card
          title="The ceiling is already breached"
          subtitle="These roles are over 100% on approved work alone — before anything new is taken on."
          className="border-l-4"
        >
          <ul className="space-y-1.5">
            {committedBreaches.map((b) => (
              <li key={`${b.role}-${b.periodKey}`} className="flex items-center gap-2 text-[0.8125rem]">
                <StatusChip status="red" label="Over" />
                <span className="font-semibold">{b.role}</span>
                <span className="secondary">
                  is at {pct(b.utilizationPct)} in {b.periodLabel} —
                  {' '}{days(Math.abs(b.overDays))} person-days more than the team has.
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs muted mt-3">
            Something has to give: cut scope, move a date, add headcount, or accept
            the overrun explicitly. The tool will not absorb it silently.
          </p>
        </Card>
      )}

      {pipelineBreaches.length > 0 && (
        <Card
          title="Roles that break if the pipeline is approved"
          subtitle="Within tolerance today, over the ceiling once queued demand lands."
        >
          <ul className="space-y-1.5">
            {pipelineBreaches.map((b) => (
              <li key={`${b.role}-${b.periodKey}`} className="flex items-center gap-2 text-[0.8125rem]">
                <StatusChip status="amber" label="At risk" />
                <span className="font-semibold">{b.role}</span>
                <span className="secondary">
                  reaches {pct(b.utilizationPct)} in {b.periodLabel} with pipeline included.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div style={stale ? { opacity: 0.6 } : undefined}>
        {view === 'Chart'
          ? <CapacityChart capacity={data} showPipeline={includePipeline} />
          : <Card><CapacityTable capacity={data} /></Card>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Pipeline demand not counted against a role"
          subtitle="Sizing gaps, shown rather than guessed at."
        >
          {data.pipeline.unsized.length === 0 && data.pipeline.unscheduled.length === 0 ? (
            <p className="text-[0.8125rem] muted">
              Every pipeline item is sized and scheduled — all of it is in the numbers above.
            </p>
          ) : (
            <div className="space-y-3">
              {data.pipeline.unsized.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-1.5">
                    No Tier 2 estimate ({data.pipeline.unsized.length})
                  </h3>
                  <ul className="space-y-1">
                    {data.pipeline.unsized.map((item) => (
                      <li key={item.id} className="text-[0.8125rem] secondary">
                        <span className="font-medium">{item.title}</span>
                        {item.tshirt_size && (
                          <span className="muted">
                            {' '}— t-shirt {item.tshirt_size}
                            {item.indicativeDaysMin != null &&
                              ` (${item.indicativeDaysMin}–${item.indicativeDaysMax ?? '∞'} person-days blended)`}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs muted mt-1.5">
                    A t-shirt size has no role split, so charging it to a role would be
                    an invented number. These need Tier 2 sizing before they can be tested.
                  </p>
                </div>
              )}
              {data.pipeline.unscheduled.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-1.5">
                    No indicative window ({data.pipeline.unscheduled.length})
                  </h3>
                  <ul className="space-y-1">
                    {data.pipeline.unscheduled.map((item) => (
                      <li key={item.id} className="text-[0.8125rem] secondary">
                        <span className="font-medium">{item.title}</span>
                        <span className="muted"> — {days(item.totalDays)} person-days, no dates</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Assumptions behind these numbers" subtitle="Change them in Admin; every figure above moves.">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[0.8125rem]">
            <dt className="secondary">Effective delivery days / person / year</dt>
            <dd className="num font-semibold">{assumed.effectiveDaysPerYear}</dd>
            <dt className="secondary">Amber threshold</dt>
            <dd className="num">{pct(assumed.amberThresholdPct)}</dd>
            <dt className="secondary">Red threshold</dt>
            <dd className="num">{pct(assumed.redThresholdPct)}</dd>
            <dt className="secondary">Fiscal year starts</dt>
            <dd className="num">Month {assumed.fiscalYearStartMonth}</dd>
            <dt className="secondary">Project statuses counted as committed</dt>
            <dd className="num">{assumed.projectStatuses.join(', ')}</dd>
          </dl>
          {reference?.assumptions?.some((a) => a.description?.startsWith('PLACEHOLDER')) && (
            <p className="text-xs mt-3" style={{ color: 'var(--status-warning)' }}>
              ▲ Some of these are still placeholders from the build brief. Replace them
              with the real GFM figures before quoting these numbers to the PSC.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
