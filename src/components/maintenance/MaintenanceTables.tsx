'use client';

/*
 * The maintenance record lists, in the fleet table
 * (~/dev/brain/docs/STANDARD-table-views.md): one line per record, filter and
 * sort in the header, grouping where it means something, the action pinned
 * right so it stays under the thumb on a phone.
 *
 * The pages are server components and cannot hand a table functions, so they
 * pass plain rows (built with `planView` / `assetView` below, which are safe to
 * call on the server) and the columns live here.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { DataTable, StatusPill, type DataColumn, type GroupDef, type PillTone, ROW_BUTTON, TOUCH_TARGET } from '@/components/ui/DataTable';
import type { IssueRow } from './IssuesList';
import TaskSupplies, { type NeedView, type SupplyOption } from './TaskSupplies';

export type Verdict = 'red' | 'yellow' | 'green';

const VERDICT_TONE: Record<Verdict, PillTone> = { red: 'red', yellow: 'yellow', green: 'green' };
/* How a person sorts a to-do pile: what is late, what is now, what is coming. */
const VERDICT_WORD: Record<Verdict, string> = { red: 'Past due', yellow: 'Due now', green: 'Upcoming' };
const VERDICT_TEXT: Record<Verdict, string> = { red: 'text-red-700', yellow: 'text-yellow-700', green: 'text-slate-600' };
const VERDICT_RANK: Record<Verdict, number> = { red: 0, yellow: 1, green: 2 };
const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm';

/* Buttons and forms inside a row must not also open the row. */
function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function VerdictPill({ verdict, title }: { verdict: Verdict; title?: string }) {
  return (
    <span title={title}>
      <StatusPill tone={VERDICT_TONE[verdict]}>{VERDICT_WORD[verdict]}</StatusPill>
    </span>
  );
}

function DoneButton({ taskId, redirect }: { taskId: string; redirect: string }) {
  return (
    <form action={`/maintenance/tasks/${taskId}/complete`} method="post">
      <input type="hidden" name="redirect" value={redirect} />
      <button
        type="submit"
        className={`flex h-6 w-6 items-center justify-center rounded-full ${TOUCH_TARGET} border border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-700`}
        title="Mark done — it rolls forward to the next date and is logged in the history"
        aria-label="Mark done"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ plans */

/** "Dec 2", or "Mar 28 '27" outside this year: short enough to sit beside the name. */
function shortDate(iso: string, todayIso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return iso.slice(0, 4) === todayIso.slice(0, 4) ? `${month} ${d}` : `${month} ${d} '${String(y).slice(2)}`;
}

/** "Every 6 months" is a column-width problem on a tablet; "6 mo" is not. */
function shortRepeats(r: string): string {
  const one: Record<string, string> = { 'Every day': 'Daily', 'Every week': 'Weekly', 'Every month': 'Monthly', 'Every year': 'Yearly' };
  if (one[r]) return one[r];
  const m = r.match(/^Every (\d+) (day|week|month|year)s?$/);
  const unit: Record<string, string> = { day: 'd', week: 'wk', month: 'mo', year: 'yr' };
  return m ? `${m[1]} ${unit[m[2]]}` : r;
}

/** The date and how far off it is, colored by the verdict — the column the eye goes to. */
function DueCell({ date, text, verdict, todayIso }: { date: string | null; text: string; verdict: Verdict | null; todayIso: string }) {
  return (
    <span className={`whitespace-nowrap ${verdict ? VERDICT_TEXT[verdict] : 'text-slate-500'} ${verdict === 'red' ? 'font-semibold' : ''}`}>
      {date ? <span className="font-medium">{shortDate(date, todayIso)}</span> : null}
      <span className="ml-1.5 text-xs">{text}</span>
    </span>
  );
}

export type PlanView = {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  typeLabel: string;
  group: string;
  repeats: string;
  dueDate: string | null;
  days: number | null;
  dueText: string;
  meterText: string;
  verdict: Verdict;
  description: string | null;
  why: string | null;
};

/**
 * Every schedule, worst first. `mode="overview"` is /maintenance (with the
 * item and type columns and a link to each item); `mode="asset"` is one item's
 * page, where the full done form and "stop this schedule" open under the row.
 */
export function PlansTable({
  plans,
  mode,
  redirect,
  todayIso,
  unit,
  supplies,
}: {
  plans: PlanView[];
  mode: 'overview' | 'asset';
  redirect: string;
  todayIso: string;
  unit?: string | null;
  /** The shelf and what each schedule takes from it. Omitted: no supplies row. */
  supplies?: { options: SupplyOption[]; needs: NeedView[] };
}) {
  const rows = [...plans].sort(
    (a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  );
  const overview = mode === 'overview';

  const hasMeter = plans.some((p) => p.meterText);

  /* Name, then when — the two things read first — then the rest. */
  const columns: DataColumn<PlanView>[] = [
    {
      key: 'title',
      header: 'Schedule',
      sortable: true,
      pinLeft: true,
      render: (p) => <span className="block max-w-[11rem] truncate sm:max-w-[22rem]">{p.title}</span>,
    },
    {
      key: 'due',
      header: 'Due',
      sortable: true,
      value: (p) => p.days,
      render: (p) => <DueCell date={p.dueDate} text={p.dueText} verdict={p.verdict} todayIso={todayIso} />,
    },
    ...(overview
      ? ([
          {
            key: 'assetName',
            header: 'Item',
            sortable: true,
            filter: 'select',
            render: (p: PlanView) => (
              <Link href={`/maintenance/${p.assetId}`} onClick={(e) => e.stopPropagation()} className="text-blue-700 hover:underline">
                {p.assetName}
              </Link>
            ),
          },
          { key: 'typeLabel', header: 'Type', sortable: true, filter: 'select' },
        ] as DataColumn<PlanView>[])
      : []),
    { key: 'repeats', header: 'Repeats', filter: 'select', render: (p) => <span className="whitespace-nowrap">{shortRepeats(p.repeats)}</span> },
    ...(hasMeter ? ([{ key: 'meterText', header: 'Meter', render: (p: PlanView) => p.meterText || '—' }] as DataColumn<PlanView>[]) : []),
    {
      key: 'done',
      header: '',
      pinRight: true,
      render: (p) => (
        <Actions>
          <DoneButton taskId={p.id} redirect={redirect} />
        </Actions>
      ),
    },
  ];

  const groups: GroupDef<PlanView>[] = [
    { key: 'status', label: 'Status', of: (p) => ({ id: p.verdict, label: VERDICT_WORD[p.verdict] }), rank: (id) => VERDICT_RANK[id as Verdict] ?? 9 },
    ...(overview
      ? [
          { key: 'item', label: 'Item', of: (p: PlanView) => ({ id: p.assetId, label: p.assetName }) },
          { key: 'group', label: 'Category', of: (p: PlanView) => ({ id: p.group, label: p.group }), rank: (id: string) => GROUP_ORDER.indexOf(id) },
        ]
      : []),
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      noun={['schedule', 'schedules']}
      searchPlaceholder="Search schedules…"
      hideSearch={!overview}
      groups={groups}
      defaultGroup="status"
      groupAlert={(rs) => ({ count: rs.filter((p) => p.verdict === 'red').length, label: 'past due' })}
      emptyState={<p className="text-sm text-slate-500">{overview ? 'Nothing scheduled yet.' : 'Nothing scheduled yet — add from the list below.'}</p>}
      renderExpanded={(p) => (
        <div className="grid gap-2 text-sm">
          <div className="text-xs text-slate-500">
            {[p.repeats, p.meterText, p.dueDate ? `next ${p.dueDate}` : null].filter(Boolean).join(' · ')}
          </div>
          {p.description && <p className="text-slate-700">{p.description}</p>}
          {p.why && <p className="text-xs italic text-slate-500">Why: {p.why}</p>}
          {supplies && <TaskSupplies taskId={p.id} needs={supplies.needs} supplies={supplies.options} />}
          {overview ? (
            <Link href={`/maintenance/${p.assetId}`} className="text-sm font-medium text-blue-700 hover:underline">
              Open {p.assetName} →
            </Link>
          ) : (
            <>
              <form action={`/maintenance/tasks/${p.id}/complete`} method="post" className="grid gap-2 sm:grid-cols-4">
                <input type="hidden" name="redirect" value={redirect} />
                <input name="performed_on" type="date" defaultValue={todayIso} className={input} aria-label="Date done" />
                {unit && <input name="meter_reading" type="number" step="any" placeholder={`${unit} now`} className={input} />}
                <input name="cost" type="number" step="0.01" placeholder="Cost $" className={input} />
                <input name="vendor" placeholder="Who did it" className={input} />
                <input name="notes" placeholder="Notes — parts used, what you found" className={`${input} sm:col-span-3`} />
                <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">
                  Done — roll forward
                </button>
              </form>
              <form action={`/maintenance/tasks/${p.id}/delete`} method="post">
                <input type="hidden" name="redirect" value={redirect} />
                <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" type="submit">
                  <Trash2 className="h-3 w-3" /> Stop this schedule
                </button>
              </form>
            </>
          )}
        </div>
      )}
    />
  );
}

/* ----------------------------------------------------------------- assets */

export const GROUP_ORDER = ['Engines & equipment', 'Vehicles & water', 'Home systems', 'Appliances', 'Other'];

export type AssetView = {
  id: string;
  name: string;
  typeLabel: string;
  group: string;
  makeModel: string;
  location: string;
  next: string | null;
  nextDate: string | null;
  nextDays: number | null;
  nextDueText: string;
  verdict: Verdict | null;
  schedules: number;
  meterText: string;
  state: string;
  financeLinked: boolean;
};

/** The inventory: one line per thing we own, grouped the way it is thought about. */
export function AssetsTable({ assets, todayIso }: { assets: AssetView[]; todayIso: string }) {
  const router = useRouter();
  /* Within each category, what is late first, then by date; nothing scheduled last. */
  const rows = [...assets].sort(
    (a, b) =>
      (a.verdict ? VERDICT_RANK[a.verdict] : 9) - (b.verdict ? VERDICT_RANK[b.verdict] : 9) ||
      (a.nextDays ?? Infinity) - (b.nextDays ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
  const columns: DataColumn<AssetView>[] = [
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      pinLeft: true,
      render: (a) => (
        <Link href={`/maintenance/${a.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[10rem] truncate hover:underline sm:max-w-[18rem]">
          {a.name}
        </Link>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      sortable: true,
      value: (a) => a.nextDays,
      render: (a) => (a.next ? <DueCell date={a.nextDate} text={a.nextDueText} verdict={a.verdict} todayIso={todayIso} /> : '—'),
    },
    { key: 'next', header: 'Next', render: (a) => (a.next ? <span className="block max-w-[14rem] truncate">{a.next}</span> : 'Nothing scheduled') },
    { key: 'typeLabel', header: 'Type', sortable: true, filter: 'select' },
    { key: 'makeModel', header: 'Make & model', sortable: true, filter: 'text', render: (a) => a.makeModel || <span className="text-yellow-700">Add make and model</span> },
    { key: 'location', header: 'Where', sortable: true, filter: 'select', render: (a) => a.location || '—' },
    {
      key: 'status',
      header: 'Status',
      filter: 'select',
      value: (a) => (a.verdict ? VERDICT_WORD[a.verdict] : 'No schedule'),
      render: (a) => (a.verdict ? <VerdictPill verdict={a.verdict} /> : <StatusPill tone="slate">No schedule</StatusPill>),
    },
    { key: 'schedules', header: 'Schedules', sortable: true },
    { key: 'meterText', header: 'Meter', render: (a) => a.meterText || '—' },
    { key: 'state', header: 'State', filter: 'select', render: (a) => (a.state === 'Stored' ? <StatusPill tone="slate">Stored</StatusPill> : 'Active') },
    { key: 'finance', header: 'FinanceOS', filter: 'select', value: (a) => (a.financeLinked ? 'Linked' : 'Not linked'), render: (a) => (a.financeLinked ? 'Linked' : '—') },
    {
      key: 'open',
      header: 'Open',
      pinRight: true,
      render: (a) => (
        <Link href={`/maintenance/${a.id}`} onClick={(e) => e.stopPropagation()} className={`${ROW_BUTTON} border border-slate-200 bg-white text-blue-700`}>
          Open
        </Link>
      ),
    },
  ];

  const groups: GroupDef<AssetView>[] = [
    { key: 'group', label: 'Category', of: (a) => ({ id: a.group, label: a.group }), rank: (id) => GROUP_ORDER.indexOf(id) },
    { key: 'type', label: 'Type', of: (a) => ({ id: a.typeLabel, label: a.typeLabel }) },
    { key: 'location', label: 'Where', of: (a) => (a.location ? { id: a.location, label: a.location } : null), emptyLabel: 'No location' },
    {
      key: 'status',
      label: 'Status',
      of: (a) => (a.verdict ? { id: a.verdict, label: VERDICT_WORD[a.verdict] } : null),
      rank: (id) => VERDICT_RANK[id as Verdict] ?? 9,
      emptyLabel: 'No schedule',
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      noun={['item', 'items']}
      searchPlaceholder="Search the inventory…"
      groups={groups}
      defaultGroup="group"
      groupAlert={(rs) => ({ count: rs.filter((a) => a.verdict === 'red').length, label: 'past due' })}
      onRowClick={(a) => router.push(`/maintenance/${a.id}`)}
      emptyState={<p className="text-sm text-slate-500">Nothing in the inventory yet.</p>}
    />
  );
}

/* ------------------------------------------------------------ suggestions */

export type SuggestionView = { id: string; title: string; repeats: string; why: string | null; field: 'library_key' | 'research_index'; value: string };

/** Best-practice items (library or AI research) not yet scheduled, each one Add away. */
export function SuggestionsTable({ rows, action, noun = ['suggestion', 'suggestions'] }: { rows: SuggestionView[]; action: string; noun?: [string, string] }) {
  const columns: DataColumn<SuggestionView>[] = [
    { key: 'title', header: 'Item', sortable: true, pinLeft: true, render: (s) => <span className="block max-w-[12rem] truncate sm:max-w-[20rem]">{s.title}</span> },
    { key: 'repeats', header: 'Repeats', filter: 'select' },
    { key: 'why', header: 'Why', render: (s) => (s.why ? <span className="block max-w-[20rem] truncate">{s.why}</span> : '—') },
    {
      key: 'add',
      header: 'Add',
      pinRight: true,
      render: (s) => (
        <Actions>
          <form action={action} method="post">
            <input type="hidden" name={s.field} value={s.value} />
            <button className={`${ROW_BUTTON} bg-blue-700 text-white`} type="submit">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </Actions>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      noun={noun}
      hideSearch
      emptyState={<p className="text-sm text-slate-500">Nothing to add.</p>}
      renderExpanded={(s) => <p className="text-sm text-slate-700">{s.why ?? 'No reason given.'}</p>}
    />
  );
}

/* ---------------------------------------------------------------- history */

export type LogView = { id: string; title: string; performed_on: string; meterText: string; cost: number | null; vendor: string | null; notes: string | null; source: string };

const money = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

/** Service history, newest first. */
export function HistoryTable({ rows }: { rows: LogView[] }) {
  const columns: DataColumn<LogView>[] = [
    { key: 'title', header: 'What', sortable: true, pinLeft: true, render: (l) => <span className="block max-w-[12rem] truncate sm:max-w-[20rem]">{l.title}</span> },
    { key: 'performed_on', header: 'Date', sortable: true },
    { key: 'vendor', header: 'Who', sortable: true, filter: 'select', render: (l) => l.vendor ?? '—' },
    { key: 'meterText', header: 'Meter', render: (l) => l.meterText || '—' },
    { key: 'cost', header: 'Cost', sortable: true, render: (l) => money(l.cost) },
    { key: 'notes', header: 'Notes', filter: 'text', render: (l) => (l.notes ? <span className="block max-w-[18rem] truncate">{l.notes}</span> : '—') },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      noun={['entry', 'entries']}
      searchPlaceholder="Search the history…"
      emptyState={<p className="text-sm text-slate-500">Nothing logged yet. Completing a schedule logs it here automatically.</p>}
      renderExpanded={(l) => (
        <div className="grid gap-1 text-sm text-slate-700">
          {l.notes ? <p>{l.notes}</p> : <p className="text-slate-500">No notes.</p>}
          <p className="text-xs text-slate-500">{l.source === 'manual' ? 'Logged by hand' : 'Logged when the schedule was marked done'}</p>
        </div>
      )}
    />
  );
}

/* ----------------------------------------------------------------- issues */


const ISSUE_TONE: Record<IssueRow['status'], PillTone> = { open: 'red', scheduled: 'yellow', resolved: 'green' };
const ISSUE_WORD: Record<IssueRow['status'], string> = { open: 'Open', scheduled: 'Scheduled', resolved: 'Resolved' };

function IssueButton({ id, redirect, status, children }: { id: string; redirect: string; status: 'scheduled' | 'resolved'; children: React.ReactNode }) {
  return (
    <form action={`/maintenance/issues/${id}/update`} method="post">
      <input type="hidden" name="redirect" value={redirect} />
      <input type="hidden" name="status" value={status} />
      <button className={`${ROW_BUTTON} border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700`} type="submit">
        {children}
      </button>
    </form>
  );
}

/**
 * Open issues, with the two moves a person makes on one: book it, or close it.
 * Open is red, scheduled yellow, resolved green.
 */
export function IssuesTable({ issues, redirect, assetNames }: { issues: IssueRow[]; redirect: string; assetNames?: Record<string, string> }) {
  const itemOf = (i: IssueRow) => (i.asset_id ? (assetNames?.[i.asset_id] ?? null) : null);
  const columns: DataColumn<IssueRow>[] = [
    { key: 'title', header: 'Issue', sortable: true, pinLeft: true, render: (i) => <span className="block max-w-[12rem] truncate sm:max-w-[22rem]">{i.title}</span> },
    ...(assetNames
      ? ([{ key: 'item', header: 'Item', sortable: true, filter: 'select', value: (i: IssueRow) => itemOf(i) ?? 'Not tied to an item' }] as DataColumn<IssueRow>[])
      : []),
    { key: 'system', header: 'System', sortable: true, filter: 'select', render: (i) => i.system ?? '—' },
    { key: 'opened_on', header: 'Opened', sortable: true },
    { key: 'next_step', header: 'Next step', render: (i) => (i.next_step ? <span className="block max-w-[16rem] truncate">{i.next_step}</span> : '—') },
    { key: 'status', header: 'Status', filter: 'select', value: (i) => ISSUE_WORD[i.status], render: (i) => <StatusPill tone={ISSUE_TONE[i.status]}>{ISSUE_WORD[i.status]}</StatusPill> },
    {
      key: 'actions',
      header: 'Mark',
      pinRight: true,
      render: (i) => (
        <Actions>
          {i.status !== 'scheduled' && (
            <IssueButton id={i.id} redirect={redirect} status="scheduled">
              Scheduled
            </IssueButton>
          )}
          <IssueButton id={i.id} redirect={redirect} status="resolved">
            Resolved
          </IssueButton>
        </Actions>
      ),
    },
  ];
  const groups: GroupDef<IssueRow>[] = [
    ...(assetNames ? [{ key: 'item', label: 'Item', of: (i: IssueRow) => { const n = itemOf(i); return n ? { id: n, label: n } : null; }, emptyLabel: 'Not tied to an item' }] : []),
    { key: 'system', label: 'System', of: (i) => (i.system ? { id: i.system, label: i.system } : null), emptyLabel: 'No system' },
    { key: 'status', label: 'Status', of: (i) => ({ id: i.status, label: ISSUE_WORD[i.status] }), rank: (id) => ['open', 'scheduled', 'resolved'].indexOf(id) },
  ];
  return (
    <DataTable
      rows={issues}
      columns={columns}
      noun={['issue', 'issues']}
      hideSearch={issues.length < 8}
      groups={groups}
      emptyState={<p className="text-sm text-slate-500">No open issues.</p>}
      renderExpanded={(i) => (
        <div className="grid gap-1 text-sm text-slate-700">
          {i.details ? <p>{i.details}</p> : <p className="text-slate-500">No details.</p>}
          {i.next_step && (
            <p>
              <span className="font-medium">Next: </span>
              {i.next_step}
            </p>
          )}
        </div>
      )}
    />
  );
}
