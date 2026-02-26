'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
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
};

type Props = {
  metrics: Metric[];
};

type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';

export default function MetricsTrendsClient({ metrics }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

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
      <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
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
              className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm"
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
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Heart Metrics</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="rhr"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="RHR (bpm)"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="hrv"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="HRV (ms)"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recovery Metrics Chart */}
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Recovery Metrics</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="bodyBattery"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Body Battery"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="stress"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Stress Level"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sleep Chart */}
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Sleep Metrics</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 12]} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="sleepScore"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  name="Sleep Score"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sleepHours"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  name="Sleep Hours"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Body Composition Chart */}
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Body Composition</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 50]} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="weight"
                  stroke="#ec4899"
                  strokeWidth={2}
                  name="Weight (lbs)"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="bodyFat"
                  stroke="#f97316"
                  strokeWidth={2}
                  name="Body Fat %"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-12 text-center shadow-sm">
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
