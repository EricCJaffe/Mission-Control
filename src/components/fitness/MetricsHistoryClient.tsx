'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataColumn } from '@/components/ui/DataTable';

type Metric = {
  id: string;
  user_id: string;
  metric_date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  stress_avg: number | null;
  sleep_score: number | null;
  sleep_duration_min: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  muscle_mass_lbs: number | null;
  bone_mass_lbs: number | null;
  hydration_lbs: number | null;
  vo2_max: number | null;
  training_readiness: number | null;
  notes: string | null;
  garmin_data: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  metrics: Metric[];
  initialMetric?: string;
  initialRange?: string;
};

type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';
type MetricFocus = 'all' | 'weight' | 'body_fat_pct' | 'muscle_mass_lbs' | 'bone_mass_lbs' | 'hydration_lbs' | 'resting_hr' | 'hrv_ms' | 'body_battery' | 'sleep_score' | 'vo2_max';

const METRIC_LABELS: Record<MetricFocus, string> = {
  all: 'All Metrics',
  weight: 'Weight',
  body_fat_pct: 'Body Fat %',
  muscle_mass_lbs: 'Muscle Mass',
  bone_mass_lbs: 'Bone Mass',
  hydration_lbs: 'Hydration',
  resting_hr: 'Resting HR',
  hrv_ms: 'HRV',
  body_battery: 'Body Battery',
  sleep_score: 'Sleep Score',
  vo2_max: 'VO2 Max',
};

function isDateRange(value?: string): value is DateRange {
  return value === '7d' || value === '30d' || value === '90d' || value === '1y' || value === 'all';
}

function isMetricFocus(value?: string): value is MetricFocus {
  return !!value && value in METRIC_LABELS;
}

function Sparkline({ values, color = '#3b82f6', height = 52 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div className="text-xs text-slate-400">Not enough data</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function metricValue(row: Metric, key: Exclude<MetricFocus, 'all'>): number | null {
  switch (key) {
    case 'weight':
      return row.weight_lbs;
    case 'body_fat_pct':
      return row.body_fat_pct;
    case 'muscle_mass_lbs':
      return row.muscle_mass_lbs ?? null;
    case 'bone_mass_lbs':
      return row.bone_mass_lbs ?? null;
    case 'hydration_lbs':
      return row.hydration_lbs ?? null;
    case 'resting_hr':
      return row.resting_hr;
    case 'hrv_ms':
      return row.hrv_ms;
    case 'body_battery':
      return row.body_battery;
    case 'sleep_score':
      return row.sleep_score;
    case 'vo2_max':
      return row.vo2_max;
  }
}

function deltaOverWindow(rows: Metric[], key: Exclude<MetricFocus, 'all'>): { change: number | null; latest: number | null } {
  const series = rows.map((row) => metricValue(row, key)).filter((value): value is number => typeof value === 'number');
  if (series.length === 0) return { change: null, latest: null };
  if (series.length === 1) return { change: 0, latest: series[0] };
  return {
    change: Math.round((series[series.length - 1] - series[0]) * 10) / 10,
    latest: series[series.length - 1],
  };
}

const unit = (v: number | null, suffix: string) => (v != null ? `${v} ${suffix}` : '—');
const numCol = (key: keyof Metric, header: string, render?: (m: Metric) => React.ReactNode): DataColumn<Metric> => ({
  key,
  header,
  sortable: true,
  className: 'tabular-nums',
  value: (m) => m[key] as number | null,
  render,
});

/* One line per day. Everything else a day holds opens under its row. */
const HISTORY_COLUMNS: DataColumn<Metric>[] = [
  {
    key: 'metric_date',
    header: 'Date',
    sortable: true,
    pinLeft: true,
    render: (m) => new Date(m.metric_date).toLocaleDateString(),
  },
  numCol('resting_hr', 'RHR', (m) => (m.resting_hr ? `${m.resting_hr} bpm` : '—')),
  numCol('hrv_ms', 'HRV', (m) => (m.hrv_ms ? `${m.hrv_ms} ms` : '—')),
  numCol('weight_lbs', 'Weight', (m) => (m.weight_lbs ? `${m.weight_lbs} lbs` : '—')),
  numCol('body_fat_pct', 'BF %', (m) => unit(m.body_fat_pct, '%')),
  numCol('muscle_mass_lbs', 'Muscle'),
  numCol('bone_mass_lbs', 'Bone'),
  numCol('hydration_lbs', 'Hyd'),
  numCol('sleep_score', 'Sleep'),
  numCol('vo2_max', 'VO2'),
  numCol('body_battery', 'BB'),
  {
    key: 'notes',
    header: 'Notes',
    filter: 'text',
    className: 'text-xs text-slate-500',
    render: (m) => (m.notes ? <span title={m.notes}>{m.notes}</span> : ''),
  },
];

function renderMetricDetail(metric: Metric) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <div className="text-xs font-medium text-slate-600">Stress Avg</div>
          <div className="text-sm">{metric.stress_avg ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">Body Fat %</div>
          <div className="text-sm">{metric.body_fat_pct ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">Muscle / Bone</div>
          <div className="text-sm">{metric.muscle_mass_lbs ?? 'N/A'} / {metric.bone_mass_lbs ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">Hydration</div>
          <div className="text-sm">{metric.hydration_lbs ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">VO2 Max</div>
          <div className="text-sm">{metric.vo2_max ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600">Training Readiness</div>
          <div className="text-sm">{metric.training_readiness ?? 'N/A'}</div>
        </div>
      </div>
      {metric.notes && (
        <div>
          <div className="text-xs font-medium text-slate-600">Notes</div>
          <div className="whitespace-pre-wrap text-sm">{metric.notes}</div>
        </div>
      )}
      {metric.garmin_data && (
        <details className="text-xs" onClick={(e) => e.stopPropagation()}>
          <summary className="cursor-pointer font-medium text-slate-600">Raw Garmin Data</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2">{JSON.stringify(metric.garmin_data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default function MetricsHistoryClient({ metrics, initialMetric, initialRange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRange>(isDateRange(initialRange) ? initialRange : 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [metricFocus, setMetricFocus] = useState<MetricFocus>(isMetricFocus(initialMetric) ? initialMetric : 'all');

  function updateQuery(nextMetric: MetricFocus, nextRange: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMetric === 'all') params.delete('metric');
    else params.set('metric', nextMetric);
    if (nextRange === 'all') params.delete('range');
    else params.set('range', nextRange);
    router.replace(`/fitness/metrics/history${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  const filteredByDate = useMemo(() => {
    if (dateRange === 'all') return metrics;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    return metrics.filter((m) => new Date(m.metric_date) >= cutoffDate);
  }, [metrics, dateRange]);

  const filteredBySearch = useMemo(() => {
    if (!searchTerm) return filteredByDate;

    const term = searchTerm.toLowerCase();
    return filteredByDate.filter(
      (m) =>
        m.metric_date.includes(term) ||
        m.notes?.toLowerCase().includes(term) ||
        m.resting_hr?.toString().includes(term) ||
        m.hrv_ms?.toString().includes(term) ||
        m.weight_lbs?.toString().includes(term) ||
        m.body_fat_pct?.toString().includes(term)
    );
  }, [filteredByDate, searchTerm]);

  const focusedMetrics = useMemo(() => {
    if (metricFocus === 'all') return filteredBySearch;
    return filteredBySearch.filter((m) => metricValue(m, metricFocus) != null);
  }, [filteredBySearch, metricFocus]);

  // Newest first. The table sorts by column on top of this; the stats, the
  // sparkline and the deltas below read this order and must not follow a
  // column sort someone clicked.
  const sortedMetrics = useMemo(
    () => [...focusedMetrics].sort((a, b) => new Date(b.metric_date).getTime() - new Date(a.metric_date).getTime()),
    [focusedMetrics]
  );

  function selectMetric(nextMetric: MetricFocus) {
    setMetricFocus(nextMetric);
    updateQuery(nextMetric, dateRange);
  }

  const stats = useMemo(() => {
    const filtered = sortedMetrics.filter((m) => m.resting_hr || m.hrv_ms || m.body_battery);
    const count = (predicate: (m: Metric) => boolean) => filtered.filter(predicate).length;
    return {
      total: sortedMetrics.length,
      avgRHR: count((m) => m.resting_hr != null) > 0
        ? Math.round(filtered.reduce((sum, m) => sum + (m.resting_hr || 0), 0) / count((m) => m.resting_hr != null))
        : null,
      avgHRV: count((m) => m.hrv_ms != null) > 0
        ? Math.round(filtered.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) / count((m) => m.hrv_ms != null))
        : null,
      avgBodyBattery: count((m) => m.body_battery != null) > 0
        ? Math.round(filtered.reduce((sum, m) => sum + (m.body_battery || 0), 0) / count((m) => m.body_battery != null))
        : null,
    };
  }, [sortedMetrics]);

  const orderedAsc = useMemo(() => [...sortedMetrics].reverse(), [sortedMetrics]);
  const focusSeries = useMemo(() => {
    if (metricFocus === 'all') return [];
    return orderedAsc.map((metric) => metricValue(metric, metricFocus)).filter((value): value is number => typeof value === 'number');
  }, [orderedAsc, metricFocus]);

  const focusDelta = useMemo(() => {
    if (metricFocus === 'all') return null;
    return deltaOverWindow(orderedAsc, metricFocus);
  }, [orderedAsc, metricFocus]);

  const bodyCompDeltas = useMemo(() => ({
    weight: deltaOverWindow([...filteredByDate].reverse(), 'weight'),
    bodyFat: deltaOverWindow([...filteredByDate].reverse(), 'body_fat_pct'),
    muscle: deltaOverWindow([...filteredByDate].reverse(), 'muscle_mass_lbs'),
    bone: deltaOverWindow([...filteredByDate].reverse(), 'bone_mass_lbs'),
    hydration: deltaOverWindow([...filteredByDate].reverse(), 'hydration_lbs'),
  }), [filteredByDate]);

  const bodyCompCards = [
    { key: 'weight' as const, focus: 'weight' as const, label: 'Weight', unit: 'lbs', color: '#8b5cf6' },
    { key: 'bodyFat' as const, focus: 'body_fat_pct' as const, label: 'Body Fat', unit: '%', color: '#f97316' },
    { key: 'muscle' as const, focus: 'muscle_mass_lbs' as const, label: 'Muscle Mass', unit: 'lbs', color: '#10b981' },
    { key: 'bone' as const, focus: 'bone_mass_lbs' as const, label: 'Bone Mass', unit: 'lbs', color: '#6366f1' },
    { key: 'hydration' as const, focus: 'hydration_lbs' as const, label: 'Hydration', unit: 'lbs', color: '#06b6d4' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Total Records</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg RHR</div>
          <div className="text-2xl font-bold">{stats.avgRHR || '—'} bpm</div>
        </div>
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg HRV</div>
          <div className="text-2xl font-bold">{stats.avgHRV || '—'} ms</div>
        </div>
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg Body Battery</div>
          <div className="text-2xl font-bold">{stats.avgBodyBattery || '—'}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {bodyCompCards.map(({ key, focus, label, unit, color }) => {
          const delta = bodyCompDeltas[key];
          const series = [...filteredByDate]
            .reverse()
            .map((metric) => metricValue(metric, focus))
            .filter((value): value is number => typeof value === 'number');
          return (
            <button
              key={key}
              onClick={() => selectMetric(focus)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition hover:border-slate-300 ${
                metricFocus === focus ? 'border-slate-800 bg-slate-50' : 'border-slate-100 bg-white'
              }`}
            >
              <div className="text-sm text-slate-600">{label} ({dateRange})</div>
              <div className="mt-1 text-2xl font-bold">{delta.latest != null ? `${delta.latest} ${unit}` : '—'}</div>
              <div className={`mt-1 text-sm ${delta.change == null ? 'text-slate-400' : delta.change > 0 ? 'text-emerald-600' : delta.change < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {delta.change == null ? 'No change data' : `${delta.change > 0 ? '+' : ''}${delta.change} ${unit}`}
              </div>
              <div className="mt-3">
                <Sparkline values={series} color={color} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['7d', '30d', '90d', '1y', 'all'] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => {
                  setDateRange(range);
                  updateQuery(metricFocus, range);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {range === 'all' ? 'All Time' : range.toUpperCase()}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search metrics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(METRIC_LABELS) as MetricFocus[]).map((metric) => (
            <button
              key={metric}
              onClick={() => selectMetric(metric)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                metricFocus === metric
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {METRIC_LABELS[metric]}
            </button>
          ))}
        </div>
      </div>

      {metricFocus !== 'all' && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{METRIC_LABELS[metricFocus]} Trend</h2>
              <p className="text-sm text-slate-500">
                {focusDelta?.latest != null ? `Latest: ${focusDelta.latest}` : 'No current value'} · {focusDelta?.change != null ? `${focusDelta.change > 0 ? '+' : ''}${focusDelta.change} over ${dateRange}` : 'No delta available'}
              </p>
            </div>
            <div className="text-sm text-slate-500">{sortedMetrics.length} matching records</div>
          </div>
          <div className="mt-4">
            <Sparkline values={focusSeries} color="#0f172a" height={72} />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link
          href="/fitness/trends"
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          View Trends
        </Link>
        <Link
          href="/fitness/metrics/analytics"
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          AI Analytics
        </Link>
        <Link
          href="/fitness/settings/garmin/import"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Import More Data
        </Link>
      </div>

      <DataTable
        rows={sortedMetrics}
        columns={HISTORY_COLUMNS}
        renderExpanded={renderMetricDetail}
        noun={['day', 'days']}
        hideSearch
        emptyState={<p className="text-sm text-slate-500">No metrics found. Import FIT files to get started.</p>}
      />

      <div className="text-center text-sm text-slate-500">
        Showing {sortedMetrics.length} of {metrics.length} total records
      </div>
    </div>
  );
}
