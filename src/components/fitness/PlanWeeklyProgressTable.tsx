'use client';

import { DataTable, type DataColumn } from '@/components/ui/DataTable';

/* A training plan's weeks, one line each, in plan order. */

export type PlanWeekRow = {
  id: string;
  week: number;
  planned: number;
  completed: number;
  adherence: number;
  zone2Minutes: number;
  strengthPlanned: number;
  strengthCompleted: number;
  recoverySessions: number;
};

const num = (key: keyof PlanWeekRow, header: string, render?: (r: PlanWeekRow) => React.ReactNode): DataColumn<PlanWeekRow> => ({
  key,
  header,
  sortable: true,
  className: 'text-right tabular-nums',
  render,
});

const columns: DataColumn<PlanWeekRow>[] = [
  { key: 'week', header: 'Week', sortable: true, render: (r) => `Week ${r.week}` },
  num('planned', 'Planned'),
  num('completed', 'Done'),
  num('adherence', 'Adherence', (r) => `${r.adherence}%`),
  num('zone2Minutes', 'Z2 Min'),
  num('strengthCompleted', 'Strength', (r) => `${r.strengthCompleted}/${r.strengthPlanned}`),
  num('recoverySessions', 'Recovery'),
];

export default function PlanWeeklyProgressTable({ rows }: { rows: Omit<PlanWeekRow, 'id'>[] }) {
  return (
    <DataTable
      rows={rows.map((r) => ({ ...r, id: String(r.week) }))}
      columns={columns}
      noun={['week', 'weeks']}
      hideSearch
    />
  );
}
