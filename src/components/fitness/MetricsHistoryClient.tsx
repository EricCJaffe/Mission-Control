'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

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
  vo2_max: number | null;
  training_readiness: number | null;
  notes: string | null;
  garmin_data: any | null;
  created_at: string;
};

type Props = {
  metrics: Metric[];
};

type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';
type SortField = 'date' | 'rhr' | 'hrv' | 'bodyBattery' | 'sleep' | 'weight';
type SortDirection = 'asc' | 'desc';

export default function MetricsHistoryClient({ metrics }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filter by date range
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

  // Filter by search term
  const filteredBySearch = useMemo(() => {
    if (!searchTerm) return filteredByDate;

    const term = searchTerm.toLowerCase();
    return filteredByDate.filter(
      (m) =>
        m.metric_date.includes(term) ||
        m.notes?.toLowerCase().includes(term) ||
        m.resting_hr?.toString().includes(term) ||
        m.hrv_ms?.toString().includes(term)
    );
  }, [filteredByDate, searchTerm]);

  // Sort
  const sortedMetrics = useMemo(() => {
    const sorted = [...filteredBySearch];

    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'date':
          aVal = new Date(a.metric_date).getTime();
          bVal = new Date(b.metric_date).getTime();
          break;
        case 'rhr':
          aVal = a.resting_hr ?? -Infinity;
          bVal = b.resting_hr ?? -Infinity;
          break;
        case 'hrv':
          aVal = a.hrv_ms ?? -Infinity;
          bVal = b.hrv_ms ?? -Infinity;
          break;
        case 'bodyBattery':
          aVal = a.body_battery ?? -Infinity;
          bVal = b.body_battery ?? -Infinity;
          break;
        case 'sleep':
          aVal = a.sleep_score ?? -Infinity;
          bVal = b.sleep_score ?? -Infinity;
          break;
        case 'weight':
          aVal = a.weight_lbs ?? -Infinity;
          bVal = b.weight_lbs ?? -Infinity;
          break;
        default:
          return 0;
      }

      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredBySearch, sortField, sortDirection]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function toggleExpanded(id: string) {
    setExpandedRow(expandedRow === id ? null : id);
  }

  const stats = useMemo(() => {
    const filtered = sortedMetrics.filter((m) => m.resting_hr || m.hrv_ms || m.body_battery);

    return {
      total: sortedMetrics.length,
      avgRHR:
        filtered.length > 0
          ? Math.round(
              filtered.reduce((sum, m) => sum + (m.resting_hr || 0), 0) /
                filtered.filter((m) => m.resting_hr).length
            )
          : null,
      avgHRV:
        filtered.length > 0
          ? Math.round(
              filtered.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) /
                filtered.filter((m) => m.hrv_ms).length
            )
          : null,
      avgBodyBattery:
        filtered.length > 0
          ? Math.round(
              filtered.reduce((sum, m) => sum + (m.body_battery || 0), 0) /
                filtered.filter((m) => m.body_battery).length
            )
          : null,
    };
  }, [sortedMetrics]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Total Records</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg RHR</div>
          <div className="text-2xl font-bold">{stats.avgRHR || '—'} bpm</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg HRV</div>
          <div className="text-2xl font-bold">{stats.avgHRV || '—'} ms</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">Avg Body Battery</div>
          <div className="text-2xl font-bold">{stats.avgBodyBattery || '—'}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Date Range Filters */}
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

          {/* Search */}
          <input
            type="text"
            placeholder="Search metrics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link
          href="/fitness/trends"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
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

      {/* Metrics Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('date')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  Date
                  {sortField === 'date' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('rhr')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  RHR
                  {sortField === 'rhr' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('hrv')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  HRV
                  {sortField === 'hrv' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('bodyBattery')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  Body Battery
                  {sortField === 'bodyBattery' && (
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('sleep')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  Sleep
                  {sortField === 'sleep' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="p-3 text-left">
                <button
                  onClick={() => toggleSort('weight')}
                  className="flex items-center gap-1 text-sm font-semibold hover:text-blue-600"
                >
                  Weight
                  {sortField === 'weight' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="p-3 text-left text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetrics.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No metrics found. Import FIT files to get started.
                </td>
              </tr>
            ) : (
              sortedMetrics.map((metric) => (
                <>
                  <tr
                    key={metric.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="p-3 text-sm">
                      {new Date(metric.metric_date).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-sm">
                      {metric.resting_hr ? `${metric.resting_hr} bpm` : '—'}
                    </td>
                    <td className="p-3 text-sm">{metric.hrv_ms ? `${metric.hrv_ms} ms` : '—'}</td>
                    <td className="p-3 text-sm">{metric.body_battery ?? '—'}</td>
                    <td className="p-3 text-sm">
                      {metric.sleep_score
                        ? `${metric.sleep_score} (${Math.round((metric.sleep_duration_min || 0) / 60)}h)`
                        : '—'}
                    </td>
                    <td className="p-3 text-sm">
                      {metric.weight_lbs ? `${metric.weight_lbs} lbs` : '—'}
                    </td>
                    <td className="p-3 text-sm">
                      <button
                        onClick={() => toggleExpanded(metric.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {expandedRow === metric.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expandedRow === metric.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="p-4">
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
                              <div className="text-xs font-medium text-slate-600">VO2 Max</div>
                              <div className="text-sm">{metric.vo2_max ?? 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-slate-600">
                                Training Readiness
                              </div>
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
                            <details className="text-xs">
                              <summary className="cursor-pointer font-medium text-slate-600">
                                Raw Garmin Data
                              </summary>
                              <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2">
                                {JSON.stringify(metric.garmin_data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="text-center text-sm text-slate-500">
        Showing {sortedMetrics.length} of {metrics.length} total records
      </div>
    </div>
  );
}
