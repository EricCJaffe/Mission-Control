'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';

type BodyCompositionRow = {
  metric_date: string;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  muscle_mass_lbs: number | null;
  bone_mass_lbs: number | null;
  hydration_lbs: number | null;
};

type Props = {
  metrics: BodyCompositionRow[];
};

type DateRange = '30d' | '90d' | '1y' | 'all';
type MetricKey = 'weight_lbs' | 'body_fat_pct' | 'muscle_mass_lbs' | 'bone_mass_lbs' | 'hydration_lbs';

const RANGE_LABELS: Record<DateRange, string> = {
  '30d': '30D',
  '90d': '90D',
  '1y': '1Y',
  all: 'All',
};

const METRIC_META: Record<MetricKey, { label: string; unit: string; color: string; format: (v: number) => string }> = {
  weight_lbs: { label: 'Weight', unit: 'lbs', color: '#8b5cf6', format: (v) => `${v.toFixed(1)} lbs` },
  body_fat_pct: { label: 'Body Fat', unit: '%', color: '#f97316', format: (v) => `${v.toFixed(1)}%` },
  muscle_mass_lbs: { label: 'Muscle Mass', unit: 'lbs', color: '#10b981', format: (v) => `${v.toFixed(1)} lbs` },
  bone_mass_lbs: { label: 'Bone Mass', unit: 'lbs', color: '#6366f1', format: (v) => `${v.toFixed(1)} lbs` },
  hydration_lbs: { label: 'Hydration', unit: 'lbs', color: '#06b6d4', format: (v) => `${v.toFixed(1)} lbs` },
};

function getCutoff(range: DateRange): Date | null {
  if (range === 'all') return null;
  const d = new Date();
  if (range === '30d') d.setDate(d.getDate() - 30);
  if (range === '90d') d.setDate(d.getDate() - 90);
  if (range === '1y') d.setFullYear(d.getFullYear() - 1);
  return d;
}

function series(rows: BodyCompositionRow[], key: MetricKey): number[] {
  return rows.map((row) => row[key]).filter((value): value is number => typeof value === 'number');
}

function average(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function latest(values: number[]): number | null {
  return values.length ? values[values.length - 1] : null;
}

function delta(values: number[]): number | null {
  return values.length >= 2 ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : values.length === 1 ? 0 : null;
}

function pctChange(values: number[]): number | null {
  if (values.length < 2 || values[0] === 0) return null;
  return Math.round((((values[values.length - 1] - values[0]) / values[0]) * 100) * 10) / 10;
}

function trendTone(value: number | null) {
  if (value == null) return 'text-slate-400';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-rose-600';
  return 'text-slate-500';
}

function bodyFatBand(bodyFat: number | null) {
  if (bodyFat == null) return { label: 'No current body-fat reading', tone: 'text-slate-500', note: 'Add more Withings scans to interpret composition.' };
  if (bodyFat < 10) return { label: 'Lean / aggressive range', tone: 'text-amber-600', note: 'Avoid pushing lower aggressively given recovery and cardiac constraints.' };
  if (bodyFat <= 18) return { label: 'Strong maintenance range', tone: 'text-emerald-600', note: 'Current composition sits in a solid maintenance zone for endurance-priority training.' };
  if (bodyFat <= 22) return { label: 'Manageable improvement range', tone: 'text-amber-600', note: 'Body-fat reduction could help cardiac efficiency if done gradually without compromising muscle.' };
  return { label: 'Reduction worth prioritizing', tone: 'text-rose-600', note: 'Focus on sustainable fat loss while protecting hydration, recovery, and lean mass.' };
}

function weightGuardrail(weightValues: number[]) {
  const change = delta(weightValues);
  if (change == null) return { label: 'No recent trend yet', tone: 'text-slate-500', note: 'Need at least two data points to assess the trend.' };
  if (Math.abs(change) < 2) return { label: 'Stable weight trend', tone: 'text-emerald-600', note: 'No obvious short-window fluid or scale volatility signal.' };
  if (change > 2) return { label: 'Watch fluid / scale drift', tone: 'text-amber-600', note: 'A >2 lb move over 30d can reflect body comp change, but with HF context it is worth cross-checking sodium, hydration, and symptoms.' };
  return { label: 'Weight trending down', tone: 'text-blue-600', note: 'If intentional, ensure muscle mass and energy levels remain stable.' };
}

function chartData(rows: BodyCompositionRow[]) {
  return rows.map((row) => ({
    date: new Date(row.metric_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: row.weight_lbs,
    bodyFat: row.body_fat_pct,
    muscle: row.muscle_mass_lbs,
    bone: row.bone_mass_lbs,
    hydration: row.hydration_lbs,
  }));
}

export default function BodyCompositionDashboardClient({ metrics }: Props) {
  const [range, setRange] = useState<DateRange>('90d');
  const cutoff = getCutoff(range);

  const filteredMetrics = useMemo(() => {
    if (!cutoff) return metrics;
    return metrics.filter((row) => new Date(row.metric_date) >= cutoff);
  }, [metrics, cutoff]);

  const chartRows = useMemo(() => chartData(filteredMetrics), [filteredMetrics]);
  const values = useMemo(() => ({
    weight: series(filteredMetrics, 'weight_lbs'),
    bodyFat: series(filteredMetrics, 'body_fat_pct'),
    muscle: series(filteredMetrics, 'muscle_mass_lbs'),
    bone: series(filteredMetrics, 'bone_mass_lbs'),
    hydration: series(filteredMetrics, 'hydration_lbs'),
  }), [filteredMetrics]);

  const currentBodyFat = latest(values.bodyFat);
  const bodyFatStatus = bodyFatBand(currentBodyFat);
  const weightStatus = weightGuardrail(values.weight);

  const cards: Array<{ key: keyof typeof values; metricKey: MetricKey }> = [
    { key: 'weight', metricKey: 'weight_lbs' },
    { key: 'bodyFat', metricKey: 'body_fat_pct' },
    { key: 'muscle', metricKey: 'muscle_mass_lbs' },
    { key: 'bone', metricKey: 'bone_mass_lbs' },
    { key: 'hydration', metricKey: 'hydration_lbs' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Body Composition Dashboard</h2>
          <p className="text-sm text-slate-500">Withings-driven composition trends with change summaries, averages, and guardrails.</p>
        </div>
        <div className="flex gap-2">
          {(['30d', '90d', '1y', 'all'] as DateRange[]).map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${range === value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {RANGE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ key, metricKey }) => {
          const metricValues = values[key];
          const meta = METRIC_META[metricKey];
          const avg = average(metricValues);
          const current = latest(metricValues);
          const change = delta(metricValues);
          const changePct = pctChange(metricValues);
          return (
            <Link
              key={metricKey}
              href={`/fitness/metrics/history?metric=${metricKey === 'weight_lbs' ? 'weight' : metricKey}&range=${range}`}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="text-sm text-slate-600">{meta.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">{current != null ? meta.format(current) : '—'}</div>
              <div className="mt-1 text-sm text-slate-500">Avg {range === 'all' ? 'all-time' : range}: {avg != null ? meta.format(avg) : '—'}</div>
              <div className={`mt-1 text-sm font-medium ${trendTone(change)}`}>
                {change != null ? `${change > 0 ? '+' : ''}${change} ${meta.unit}` : 'No delta'}
                {changePct != null ? ` (${changePct > 0 ? '+' : ''}${changePct}%)` : ''}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Weight & Body Fat Trend</h3>
            <p className="text-sm text-slate-500">Reference band highlights where body-fat maintenance is likely most practical for current endurance and cardiac goals.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartRows} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 30]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip />
              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
              <ReferenceArea yAxisId="right" y1={12} y2={18} fill="#dcfce7" fillOpacity={0.3} />
              <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#8b5cf6" strokeWidth={3} dot={false} name="Weight (lbs)" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="bodyFat" stroke="#f97316" strokeWidth={3} dot={false} name="Body Fat %" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Muscle, Bone & Hydration</h3>
            <p className="text-sm text-slate-500">Useful for checking whether weight change is accompanied by lean-mass preservation and stable scale hydration.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartRows} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <Tooltip />
              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
              <Line type="monotone" dataKey="muscle" stroke="#10b981" strokeWidth={3} dot={false} name="Muscle (lbs)" connectNulls />
              <Line type="monotone" dataKey="bone" stroke="#6366f1" strokeWidth={3} dot={false} name="Bone (lbs)" connectNulls />
              <Line type="monotone" dataKey="hydration" stroke="#06b6d4" strokeWidth={3} dot={false} name="Hydration (lbs)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Body-Fat Interpretation</h3>
          <p className={`mt-2 text-sm font-medium ${bodyFatStatus.tone}`}>{bodyFatStatus.label}</p>
          <p className="mt-2 text-sm text-slate-600">{bodyFatStatus.note}</p>
          <p className="mt-3 text-xs text-slate-500">Reference band shown on chart: roughly 12-18% as a practical maintenance zone, not a medical target.</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Weight / Fluid Guardrail</h3>
          <p className={`mt-2 text-sm font-medium ${weightStatus.tone}`}>{weightStatus.label}</p>
          <p className="mt-2 text-sm text-slate-600">{weightStatus.note}</p>
          <p className="mt-3 text-xs text-slate-500">For your HF context, unusual short-window scale changes should always be interpreted with hydration, sodium, symptoms, and BP.</p>
        </div>
      </div>
    </div>
  );
}
