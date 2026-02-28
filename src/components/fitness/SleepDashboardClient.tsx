'use client';

import { useState, useMemo } from 'react';
import { Moon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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

type SleepLog = {
  id: string;
  sleep_date: string;
  sleep_start: string;
  sleep_end: string;
  total_sleep_seconds: number;
  light_sleep_seconds: number | null;
  deep_sleep_seconds: number | null;
  rem_sleep_seconds: number | null;
  awake_seconds: number | null;
  sleep_score: number | null;
  avg_hrv: number | null;
  hrv_status: string | null;
  avg_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  duration_to_sleep_seconds: number | null;
  duration_to_wake_seconds: number | null;
  wake_up_count: number | null;
  snoring_seconds: number | null;
  snoring_episodes: number | null;
  source: string;
  notes: string | null;
};

type Props = {
  sleepLogs: SleepLog[];
};

type DateRange = '7d' | '30d' | '90d' | 'all';

export default function SleepDashboardClient({ sleepLogs: initial }: Props) {
  const [sleepLogs] = useState(initial);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  // Filter by date range
  const filteredLogs = useMemo(() => {
    if (dateRange === 'all') return sleepLogs;

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
    }

    return sleepLogs.filter((log) => new Date(log.sleep_date) >= cutoffDate);
  }, [sleepLogs, dateRange]);

  // Calculate stats
  const stats = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const latest = filteredLogs[0];
    const avgDuration = filteredLogs.reduce((sum, log) => sum + log.total_sleep_seconds, 0) / filteredLogs.length / 3600;
    const avgScore = filteredLogs.filter(l => l.sleep_score).reduce((sum, log) => sum + (log.sleep_score || 0), 0) / filteredLogs.filter(l => l.sleep_score).length;
    const avgHr = filteredLogs.filter(l => l.avg_hr).reduce((sum, log) => sum + (log.avg_hr || 0), 0) / filteredLogs.filter(l => l.avg_hr).length;
    const avgHrv = filteredLogs.filter(l => l.avg_hrv).reduce((sum, log) => sum + (log.avg_hrv || 0), 0) / filteredLogs.filter(l => l.avg_hrv).length;

    // Calculate efficiency: total_sleep / (total_sleep + awake)
    const avgEfficiency = filteredLogs.reduce((sum, log) => {
      const totalTime = log.total_sleep_seconds + (log.awake_seconds || 0);
      return sum + (totalTime > 0 ? (log.total_sleep_seconds / totalTime) * 100 : 0);
    }, 0) / filteredLogs.length;

    // Trend (recent 7 vs previous 7)
    const recent7 = filteredLogs.slice(0, 7);
    const prev7 = filteredLogs.slice(7, 14);

    let trend = null;
    if (recent7.length >= 3 && prev7.length >= 3) {
      const recentAvg = recent7.reduce((s, l) => s + l.total_sleep_seconds, 0) / recent7.length / 3600;
      const prevAvg = prev7.reduce((s, l) => s + l.total_sleep_seconds, 0) / prev7.length / 3600;
      const diff = recentAvg - prevAvg;

      trend = {
        direction: Math.abs(diff) < 0.5 ? 'stable' : diff > 0 ? 'up' : 'down',
        diff: Math.abs(diff).toFixed(1),
      };
    }

    return {
      latest: {
        duration: (latest.total_sleep_seconds / 3600).toFixed(1),
        score: latest.sleep_score,
        hr: latest.avg_hr,
        hrv: latest.avg_hrv,
      },
      avg: {
        duration: avgDuration.toFixed(1),
        score: avgScore.toFixed(0),
        hr: avgHr.toFixed(0),
        hrv: avgHrv.toFixed(0),
        efficiency: avgEfficiency.toFixed(0),
      },
      trend,
    };
  }, [filteredLogs]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return [...filteredLogs].reverse().map((log) => ({
      date: new Date(log.sleep_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: log.sleep_date,
      duration: (log.total_sleep_seconds / 3600).toFixed(1),
      light: log.light_sleep_seconds ? (log.light_sleep_seconds / 3600).toFixed(1) : 0,
      deep: log.deep_sleep_seconds ? (log.deep_sleep_seconds / 3600).toFixed(1) : 0,
      rem: log.rem_sleep_seconds ? (log.rem_sleep_seconds / 3600).toFixed(1) : 0,
      awake: log.awake_seconds ? (log.awake_seconds / 3600).toFixed(1) : 0,
      score: log.sleep_score,
      avgHr: log.avg_hr,
      minHr: log.min_hr,
      maxHr: log.max_hr,
      avgHrv: log.avg_hrv,
      wakeCount: log.wake_up_count,
    }));
  }, [filteredLogs]);

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(['7d', '30d', '90d', 'all'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                dateRange === range
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">Last Night</p>
              <Moon className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.latest.duration}h</p>
            {stats.latest.score && (
              <p className="text-xs text-slate-500">Score: {stats.latest.score}/100</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">Average Duration</p>
              {stats.trend && (
                <>
                  {stats.trend.direction === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : stats.trend.direction === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-400" />
                  )}
                </>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.avg.duration}h</p>
            {stats.trend && (
              <p className="text-xs text-slate-500">
                {stats.trend.direction !== 'stable' && `±${stats.trend.diff}h vs last week`}
                {stats.trend.direction === 'stable' && 'Stable'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Avg Sleep Quality</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.avg.score}/100</p>
            <p className="text-xs text-slate-500">Efficiency: {stats.avg.efficiency}%</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Avg HR During Sleep</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.avg.hr} bpm</p>
            {parseFloat(stats.avg.hrv) > 0 && (
              <p className="text-xs text-slate-500">HRV: {stats.avg.hrv} ms</p>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="space-y-6">
          {/* Sleep Duration Trend */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Sleep Duration Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  domain={[0, 12]}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                  label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="duration"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Total Sleep (hrs)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sleep Stage Breakdown */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Sleep Stage Breakdown</h2>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                  label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="deep"
                  stackId="1"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.8}
                  name="Deep Sleep"
                />
                <Area
                  type="monotone"
                  dataKey="rem"
                  stackId="1"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.8}
                  name="REM Sleep"
                />
                <Area
                  type="monotone"
                  dataKey="light"
                  stackId="1"
                  stroke="#a78bfa"
                  fill="#a78bfa"
                  fillOpacity={0.8}
                  name="Light Sleep"
                />
                <Area
                  type="monotone"
                  dataKey="awake"
                  stackId="1"
                  stroke="#fbbf24"
                  fill="#fbbf24"
                  fillOpacity={0.8}
                  name="Awake"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Heart Rate During Sleep */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Heart Rate During Sleep</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="avgHr"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Avg HR (bpm)"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="minHr"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Min HR"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="maxHr"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Max HR"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* HRV During Sleep (if available) */}
          {chartData.some((d) => d.avgHrv) && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">HRV During Sleep</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="avgHrv"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Avg HRV (ms)"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Historical Data Table */}
      {filteredLogs.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Sleep History ({filteredLogs.length} nights)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Duration</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Deep</th>
                  <th className="px-4 py-2 text-right font-medium">REM</th>
                  <th className="px-4 py-2 text-right font-medium">Avg HR</th>
                  <th className="px-4 py-2 text-right font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2 text-slate-600 font-mono text-xs">
                      {new Date(log.sleep_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(log.total_sleep_seconds / 3600).toFixed(1)}h
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{log.sleep_score || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-500">
                      {log.deep_sleep_seconds ? `${Math.round(log.deep_sleep_seconds / 60)}m` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-500">
                      {log.rem_sleep_seconds ? `${Math.round(log.rem_sleep_seconds / 60)}m` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{log.avg_hr || '—'}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5">
                        {log.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredLogs.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <Moon className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No sleep data for the selected time range.</p>
          <p className="text-sm text-slate-400 mt-2">
            {sleepLogs.length === 0 ? (
              <>Import from Withings to see your sleep history.</>
            ) : (
              <>Try selecting a different date range above to see older data.</>
            )}
          </p>
          {sleepLogs.length === 0 && (
            <a
              href="/fitness/settings/withings"
              className="mt-4 inline-block rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Import Sleep Data
            </a>
          )}
        </div>
      )}
    </div>
  );
}
