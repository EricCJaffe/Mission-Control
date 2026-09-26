'use client';

import { DataTable, type DataColumn } from '@/components/ui/DataTable';
import { StatusPill } from '@/components/reviews/StatusPill';
import { styleFor } from '@/lib/reviews/status';
import type { ProjectLine } from '@/lib/reviews/types';

/*
 * Projects in this review, one line each, worst first. The default order is
 * the one the review computed and no column reproduces it, which is why a third
 * click on any header clears the sort rather than cycling.
 *
 * Status uses the review's own pill (color, glyph AND word), not the generic
 * one: red here also means "no reading", and that pill carries the meaning.
 */

const columns: DataColumn<ProjectLine>[] = [
  {
    key: 'title',
    header: 'Project',
    sortable: true,
    pinLeft: true,
    render: (l) => (
      <>
        {l.title}
        {l.client && <span className="ml-2 text-xs font-normal text-slate-500">{l.client}</span>}
      </>
    ),
  },
  { key: 'client', header: 'Client', sortable: true, filter: 'select' },
  {
    key: 'status',
    header: 'Status',
    filter: 'select',
    value: (l) => styleFor(l.status).label,
    render: (l) => <StatusPill status={l.status} />,
  },
  {
    key: 'reason',
    header: 'Why',
    filter: 'text',
    className: 'text-xs text-slate-600',
    render: (l) => <span title={l.reason}>{l.reason}</span>,
  },
  { key: 'openTasks', header: 'Open', sortable: true, className: 'text-right tabular-nums' },
  {
    key: 'overdueTasks',
    header: 'Late',
    sortable: true,
    className: 'text-right tabular-nums',
    render: (l) => l.overdueTasks || '—',
  },
  {
    key: 'daysSinceTouch',
    header: 'Idle',
    sortable: true,
    className: 'text-right tabular-nums text-slate-500',
    render: (l) => (l.daysSinceTouch === null ? '—' : `${l.daysSinceTouch}d`),
  },
];

export default function ProjectLinesTable({ rows }: { rows: ProjectLine[] }) {
  return (
    <DataTable
      rows={rows}
      columns={columns}
      noun={['project', 'projects']}
      searchPlaceholder="Search projects…"
      rowClassName={(l) => styleFor(l.status).bg}
    />
  );
}
