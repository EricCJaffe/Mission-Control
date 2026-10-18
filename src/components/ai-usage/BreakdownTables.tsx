'use client';

import { DataTable, type DataColumn } from '@/components/ui/DataTable';

/*
 * The two breakdowns, one line per row. Percent of the plan is the main
 * number in both; tokens are there for scale. No dollar column (Eric,
 * 2026-10-18: percent of usage, not dollars).
 */

export type ProjectShareRow = {
  id: string;
  plan: string;
  project: string;
  client: string;
  percent: number;
  tokens: number;
  tokensLabel: string;
  sessions: number;
};

export type SessionRow = {
  id: string;
  plan: string;
  bot: string;
  host: string;
  session: string;
  project: string;
  percent: number;
  tokens: number;
  tokensLabel: string;
  messages: number;
  lastDay: string;
};

const percentCol = <T extends { percent: number }>(): DataColumn<T> => ({
  key: 'percent',
  header: '% of plan',
  sortable: true,
  className: 'text-right tabular-nums font-semibold',
  render: (r) => `${r.percent.toFixed(1)}%`,
});

const projectColumns: DataColumn<ProjectShareRow>[] = [
  { key: 'plan', header: 'Plan', sortable: true, filter: 'select', pinLeft: true },
  {
    key: 'project',
    header: 'Project',
    sortable: true,
    filter: 'select',
    render: (r) => (r.project === 'unattributed' ? <span className="italic text-slate-500">unattributed</span> : r.project),
  },
  { key: 'client', header: 'Client', sortable: true, filter: 'select', render: (r) => r.client || '—' },
  percentCol<ProjectShareRow>(),
  { key: 'tokens', header: 'Tokens', sortable: true, className: 'text-right tabular-nums', render: (r) => r.tokensLabel },
  { key: 'sessions', header: 'Sessions', sortable: true, className: 'text-right tabular-nums' },
];

const sessionColumns: DataColumn<SessionRow>[] = [
  { key: 'plan', header: 'Plan', sortable: true, filter: 'select', pinLeft: true },
  { key: 'bot', header: 'Bot', sortable: true, filter: 'select' },
  { key: 'host', header: 'Host', sortable: true, filter: 'select' },
  { key: 'project', header: 'Project', sortable: true, filter: 'select' },
  {
    key: 'session',
    header: 'Session',
    filter: 'text',
    render: (r) => <span className="font-mono text-xs" title={r.session}>{r.session ? r.session.slice(0, 12) : '—'}</span>,
  },
  percentCol<SessionRow>(),
  { key: 'tokens', header: 'Tokens', sortable: true, className: 'text-right tabular-nums', render: (r) => r.tokensLabel },
  { key: 'messages', header: 'Msgs', sortable: true, className: 'text-right tabular-nums' },
  { key: 'lastDay', header: 'Last day', sortable: true },
];

export function ProjectSharesTable({ rows }: { rows: ProjectShareRow[] }) {
  return <DataTable rows={rows} columns={projectColumns} noun={['project', 'projects']} hideSearch pageSize={50} />;
}

export function SessionTable({ rows }: { rows: SessionRow[] }) {
  return <DataTable rows={rows} columns={sessionColumns} noun={['session', 'sessions']} pageSize={25} />;
}
