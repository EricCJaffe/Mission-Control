'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type Metric = {
  id: string;
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
};

type Props = {
  metrics: Metric[];
};

type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';

export default function MetricsTrendsClient({ metrics }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // Chart visibility toggles
  const [visibleMetrics, setVisibleMetrics] = useState({
    heart: { rhr: true, hrv: true },
    recovery: { bodyBattery: true, stress: true },
    sleep: { sleepScore: true, sleepHours: true },
    bodyComp: { weight: true, bodyFat: true },
    detailed: { muscle: true, bone: true, hydration: true },
  });

  const toggleMetric = (chart: keyof typeof visibleMetrics, metric: string) => {
    setVisibleMetrics(prev => ({
      ...prev,
      [chart]: {
        ...prev[chart],
        [metric]: !prev[chart][metric as keyof typeof prev[typeof chart]],
      },
    }));
  };

  // Filter by date range
  const filteredMetrics = useMemo(() => {
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

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredMetrics.map((m) => ({
      date: new Date(m.metric_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      fullDate: m.metric_date,
      rhr: m.resting_hr,
      hrv: m.hrv_ms,
      bodyBattery: m.body_battery,
      stress: m.stress_avg,
      sleepScore: m.sleep_score,
      sleepHours: m.sleep_duration_min ? m.sleep_duration_min / 60 : null,
      weight: m.weight_lbs,
      bodyFat: m.body_fat_pct,
      muscleMass: m.muscle_mass_lbs,
      boneMass: m.bone_mass_lbs,
      hydration: m.hydration_lbs,
    }));
  }, [filteredMetrics]);

  // Calculate trends
  const trends = useMemo(() => {
    if (filteredMetrics.length < 2) return null;

    const first = filteredMetrics[0];
    const last = filteredMetrics[filteredMetrics.length - 1];

    function calcTrend(firstVal: number | null, lastVal: number | null) {
      if (!firstVal || !lastVal) return null;
      const change = lastVal - firstVal;
      const pctChange = ((change / firstVal) * 100).toFixed(1);
      return { change, pctChange, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable' };
    }

    return {
      rhr: calcTrend(first.resting_hr, last.resting_hr),
      hrv: calcTrend(first.hrv_ms, last.hrv_ms),
      bodyBattery: calcTrend(first.body_battery, last.body_battery),
      sleep: calcTrend(first.sleep_score, last.sleep_score),
      weight: calcTrend(first.weight_lbs, last.weight_lbs),
    };
  }, [filteredMetrics]);

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(['7d', '30d', '90d', '1y', 'all'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
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
      </div>

      {/* Trend Summary */}
      {trends && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'RHR', trend: trends.rhr, unit: 'bpm', inverse: true },
            { label: 'HRV', trend: trends.hrv, unit: 'ms', inverse: false },
            { label: 'Body Battery', trend: trends.bodyBattery, unit: '', inverse: false },
            { label: 'Sleep Score', trend: trends.sleep, unit: '', inverse: false },
            { label: 'Weight', trend: trends.weight, unit: 'lbs', inverse: true },
          ].map(({ label, trend, unit, inverse }) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="text-sm text-slate-600">{label} Trend</div>
              {trend ? (
                <>
                  <div className="text-xl font-bold">
                    {trend.change > 0 ? '+' : ''}
                    {trend.change.toFixed(1)} {unit}
                  </div>
                  <div
                    className={`text-sm ${
                      (inverse && trend.direction === 'down') ||
                      (!inverse && trend.direction === 'up')
                        ? 'text-green-600'
                        : (inverse && trend.direction === 'up') ||
                            (!inverse && trend.direction === 'down')
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {trend.pctChange}%
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">No data</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* Heart Metrics Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Heart Metrics</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMetric('heart', 'rhr')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.heart.rhr
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  RHR
                </button>
                <button
                  onClick={() => toggleMetric('heart', 'hrv')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.heart.hrv
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  HRV
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorRHR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHRV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                {visibleMetrics.heart.rhr && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="rhr"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="RHR (bpm)"
                    connectNulls
                  />
                )}
                {visibleMetrics.heart.hrv && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="hrv"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="HRV (ms)"
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recovery Metrics Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Recovery Metrics</h3>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorBodyBattery" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="bodyBattery"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#colorBodyBattery)"
                  name="Body Battery"
                  connectNulls
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="stress"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  fill="url(#colorStress)"
                  name="Stress Level"
                  connectNulls
                  dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sleep Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Sleep Metrics</h3>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorSleepScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSleepHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 12]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="sleepScore"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  fill="url(#colorSleepScore)"
                  name="Sleep Score"
                  connectNulls
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="sleepHours"
                  stroke="#06b6d4"
                  strokeWidth={3}
                  fill="url(#colorSleepHours)"
                  name="Sleep Hours"
                  connectNulls
                  dot={{ fill: '#06b6d4', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Body Composition Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Body Composition</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMetric('bodyComp', 'weight')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.bodyComp.weight
                      ? 'bg-pink-50 border-pink-200 text-pink-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Weight
                </button>
                <button
                  onClick={() => toggleMetric('bodyComp', 'bodyFat')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.bodyComp.bodyFat
                      ? 'bg-orange-50 border-orange-200 text-orange-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Body Fat %
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBodyFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 50]} tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                {visibleMetrics.bodyComp.weight && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="weight"
                    stroke="#ec4899"
                    strokeWidth={3}
                    dot={{ fill: '#ec4899', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Weight (lbs)"
                    connectNulls
                  />
                )}
                {visibleMetrics.bodyComp.bodyFat && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="bodyFat"
                    stroke="#f97316"
                    strokeWidth={3}
                    dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Body Fat %"
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Body Composition (Withings) */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detailed Body Composition (Withings)</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMetric('detailed', 'muscle')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.detailed.muscle
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Muscle
                </button>
                <button
                  onClick={() => toggleMetric('detailed', 'bone')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.detailed.bone
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Bone
                </button>
                <button
                  onClick={() => toggleMetric('detailed', 'hydration')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    visibleMetrics.detailed.hydration
                      ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  Hydration
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorMuscle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorHydration" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px' }} />
                {visibleMetrics.detailed.muscle && (
                  <Area
                    type="monotone"
                    dataKey="muscleMass"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#colorMuscle)"
                    name="Muscle Mass (lbs)"
                    connectNulls
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {visibleMetrics.detailed.bone && (
                  <Area
                    type="monotone"
                    dataKey="boneMass"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fill="url(#colorBone)"
                    name="Bone Mass (lbs)"
                    connectNulls
                    dot={{ fill: '#6366f1', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {visibleMetrics.detailed.hydration && (
                  <Area
                    type="monotone"
                    dataKey="hydration"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    fill="url(#colorHydration)"
                    name="Hydration (lbs)"
                    connectNulls
                    dot={{ fill: '#06b6d4', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No data available for the selected time range.</p>
          <Link
            href="/fitness/settings/garmin/import"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Import FIT Files
          </Link>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <Link
          href="/fitness/metrics/history"
          className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          ← Back to History
        </Link>
        <Link
          href="/fitness/metrics/analytics"
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          View AI Analytics →
        </Link>
      </div>
    </div>
  );
}
