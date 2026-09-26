'use client';

import { DataTable, type DataColumn } from '@/components/ui/DataTable';

/* The last 30 days of body metrics, one line per day, newest first. */

export type RecentMetricRow = {
  id: string;
  metric_date: string;
  weight_lbs: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  sleep_score: number | null;
};

const num = (key: keyof RecentMetricRow, header: string): DataColumn<RecentMetricRow> => ({
  key,
  header,
  sortable: true,
  className: 'text-right tabular-nums',
});

const columns: DataColumn<RecentMetricRow>[] = [
  {
    key: 'metric_date',
    header: 'Date',
    sortable: true,
    className: 'font-mono text-xs',
    render: (m) =>
      new Date(m.metric_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  },
  num('weight_lbs', 'Weight'),
  num('resting_hr', 'RHR'),
  num('hrv_ms', 'HRV'),
  num('body_battery', 'Battery'),
  num('sleep_score', 'Sleep'),
];

export default function RecentMetricsTable({ rows }: { rows: RecentMetricRow[] }) {
  return <DataTable rows={rows} columns={columns} noun={['day', 'days']} hideSearch />;
}
