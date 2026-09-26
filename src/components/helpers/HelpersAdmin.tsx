'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Pin, Plus, Share2, KeyRound, UserPlus, Eye } from 'lucide-react';
import { SKILLS, SKILL_LABELS, DUE_SOON_DAYS, addDays, helperView, formatHours, minutesWorked, type WorkRow } from '@/lib/helpers/list';
import { DataTable, StatusPill, type DataColumn, type GroupDef, type PillTone } from '@/components/ui/DataTable';

export type AdminData = {
  today: string;
  rows: WorkRow[];
  locationIds: Record<string, string | null>;
  candidates: Array<{ id: string; title: string; due_date: string | null; recurrence_rule: string | null }>;
  workers: Array<{ id: string; name: string; phone: string | null; email: string | null; skills: string[]; tracks_hours: boolean; hourly_rate: number | null; notes: string | null; active: boolean }>;
  accounts: Array<{ worker_id: string; email: string; disabled_at: string | null; last_login_at: string | null }>;
  properties: Array<{ id: string; label: string; kind: string | null }>;
  time: Array<{ id: string; task_title: string; worker_id: string; started_at: string; ended_at: string | null }>;
  completions: Array<{ id: string; task_title: string; worker_id: string | null; completed_at: string; note: string | null }>;
  blockerTitles: Record<string, string>;
  applications: Array<{
    id: string; posting_id: string; name: string; phone: string; email: string | null; drivers_license: boolean;
    experience: string | null; availability: string | null; heard_from: string | null; status: string; worker_id: string | null; created_at: string;
  }>;
  postings: Array<{ id: string; slug: string; title: string; active: boolean }>;
};

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';
const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const label = 'block text-xs font-medium text-slate-600';
const OTHER = '__other__';
const iconBtn = 'rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-30';
const smallBtn = 'flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs';

const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const skillLabel = (s: string) => SKILL_LABELS[s as keyof typeof SKILL_LABELS] ?? s;

/* Buttons inside a row must not also open the row. */
function Actions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

async function send(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `HTTP ${res.status}`));
  return json;
}

/* One shared job as a table row. `index` is its place in the one-off priority order; maintenance has none. */
type JobRow = WorkRow & { id: string; kind: 'One-off' | 'Maintenance'; index: number | null; withLabel: string; state: { label: string; tone: PillTone } };

type PersonRow = AdminData['workers'][number] & { account: AdminData['accounts'][number] | null };

export default function HelpersAdmin({ data }: { data: AdminData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const names = useMemo(() => new Map(data.workers.map((w) => [w.id, w.name])), [data.workers]);

  async function act(path: string, body: unknown, after?: (json: Record<string, unknown>) => void) {
    setError(null);
    try {
      const json = await send(path, body);
      after?.(json);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const jobs = useMemo<JobRow[]>(() => {
    const shared = data.rows.filter((r) => r.shared);
    const rowById = new Map(data.rows.map((r) => [r.task_id, r]));
    // Same ordering the helpers get, with every skill and no due-date window.
    const oneOff = helperView(shared, { worker_id: null, skills: null, includeBlocked: true }, names, data.today).oneOff;
    const maintenance = shared.filter((r) => r.recurrence_rule).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
    const soon = addDays(data.today, DUE_SOON_DAYS);
    const decorate = (r: WorkRow, kind: JobRow['kind'], index: number | null): JobRow => ({
      ...r,
      id: r.task_id,
      kind,
      index,
      withLabel: r.assignee_worker_id
        ? `${names.get(r.assignee_worker_id) ?? 'Unknown'}${r.claimed_at ? ' (took it)' : ''}`
        : r.assignee_name?.trim() || 'Open board',
      state: r.blocked_open
        ? { label: 'Waiting', tone: 'yellow' }
        : r.due_date && r.due_date < data.today
          ? { label: 'Overdue', tone: 'red' }
          : r.due_date && r.due_date <= soon
            ? { label: 'Due soon', tone: 'yellow' }
            : { label: 'Ready', tone: 'slate' },
    });
    return [...oneOff.map((item, i) => decorate(rowById.get(item.id)!, 'One-off', i)), ...maintenance.map((r) => decorate(r, 'Maintenance', null))];
  }, [data.rows, data.today, names]);
  const oneOffCount = jobs.filter((j) => j.kind === 'One-off').length;

  const jobColumns: DataColumn<JobRow>[] = [
    {
      key: 'title',
      header: 'Job',
      sortable: true,
      pinLeft: true,
      render: (r) => (
        <span className="flex max-w-[12rem] items-center gap-1.5 sm:max-w-[22rem]">
          {r.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-label="Pinned" />}
          <span className="truncate">{r.title}</span>
        </span>
      ),
    },
    { key: 'skill', header: 'Skill', filter: 'select', sortable: true, value: (r) => skillLabel(r.skill), render: (r) => <StatusPill tone="slate">{skillLabel(r.skill)}</StatusPill> },
    { key: 'location', header: 'Where', filter: 'select', sortable: true, value: (r) => r.location_label ?? 'No location' },
    { key: 'with', header: 'With', filter: 'select', sortable: true, value: (r) => r.withLabel },
    { key: 'due', header: 'Due', sortable: true, value: (r) => r.due_date, render: (r) => (r.due_date ? shortDate(r.due_date) : '—') },
    {
      key: 'status',
      header: 'Status',
      filter: 'select',
      value: (r) => r.state.label,
      render: (r) => (
        <span title={r.blocked_open && r.blocked_by ? `Hidden from helpers until done: ${data.blockerTitles[r.blocked_by] ?? 'another job'}` : undefined}>
          <StatusPill tone={r.state.tone}>{r.state.label}</StatusPill>
        </span>
      ),
    },
    {
      key: 'order',
      header: 'Order',
      pinRight: true,
      render: (r) => (
        <Actions>
          <button
            type="button"
            aria-label={r.pinned ? 'Unpin' : 'Pin to the top'}
            aria-pressed={r.pinned}
            title={r.pinned ? 'Unpin' : 'Pin to the top'}
            onClick={() => act('/helpers/api/item', { task_id: r.task_id, pinned: !r.pinned })}
            className={`${iconBtn} ${r.pinned ? 'border-blue-300 text-blue-700' : 'text-slate-500'}`}
          >
            <Pin className="h-4 w-4" />
          </button>
          {r.index !== null && (
            <>
              <button type="button" aria-label="Move up" disabled={r.index === 0} onClick={() => act('/helpers/api/order', { task_id: r.task_id, direction: 'up' })} className={iconBtn}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Move down" disabled={r.index === oneOffCount - 1} onClick={() => act('/helpers/api/order', { task_id: r.task_id, direction: 'down' })} className={iconBtn}>
                <ArrowDown className="h-4 w-4" />
              </button>
            </>
          )}
        </Actions>
      ),
    },
  ];

  const jobGroups: GroupDef<JobRow>[] = [
    { key: 'type', label: 'Type', of: (r) => ({ id: r.kind, label: r.kind === 'One-off' ? 'One-off jobs (top to bottom is the priority)' : 'Maintenance (shows on their list two weeks before it is due)' }), rank: (id) => (id === 'One-off' ? 0 : 1) },
    { key: 'location', label: 'Where', of: (r) => (r.location_label ? { id: r.location_label, label: r.location_label } : null), emptyLabel: 'No location' },
    { key: 'with', label: 'With', of: (r) => ({ id: r.withLabel, label: r.withLabel }), rank: (id) => (id === 'Open board' ? 1 : 0) },
  ];

  type Candidate = AdminData['candidates'][number] & { kind: string };
  const candidates: Candidate[] = data.candidates.map((c) => ({ ...c, kind: c.recurrence_rule ? 'Maintenance' : 'One-off' }));
  const candidateColumns: DataColumn<Candidate>[] = [
    { key: 'title', header: 'Task', sortable: true, pinLeft: true, render: (c) => <span className="block max-w-[14rem] truncate sm:max-w-[26rem]">{c.title}</span> },
    { key: 'kind', header: 'Type', filter: 'select', sortable: true },
    {
      key: 'due_date',
      header: 'Due',
      sortable: true,
      render: (c) => (!c.due_date ? '—' : c.due_date < data.today ? <StatusPill tone="red">Overdue {shortDate(c.due_date)}</StatusPill> : shortDate(c.due_date)),
    },
    {
      key: 'share',
      header: 'Share',
      pinRight: true,
      render: (c) => (
        <Actions>
          <button type="button" onClick={() => act('/helpers/api/item', { task_id: c.id, shared: true })} className="rounded-xl bg-blue-700 px-3 py-1.5 text-sm font-medium text-white">
            Share
          </button>
        </Actions>
      ),
    },
  ];

  const people: PersonRow[] = data.workers.map((w) => ({ ...w, account: data.accounts.find((a) => a.worker_id === w.id) ?? null }));
  const loginState = (p: PersonRow): { label: string; tone: PillTone } =>
    !p.account
      ? { label: 'No login', tone: 'slate' }
      : p.account.disabled_at
        ? { label: 'Disabled', tone: 'red' }
        : p.account.last_login_at
          ? { label: `Last in ${shortDate(p.account.last_login_at)}`, tone: 'blue' }
          : { label: 'Never signed in', tone: 'yellow' };
  const onAccount = (p: PersonRow, body: Record<string, unknown>) =>
    act('/helpers/api/account', { worker_id: p.id, ...body }, (json) => {
      if (json.password) setSecret(`Sign in at ${window.location.origin}/h\nEmail: ${json.email ?? p.account?.email ?? ''}\nPassword: ${json.password}`);
    });
  const peopleColumns: DataColumn<PersonRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      pinLeft: true,
      render: (p) => (
        <span className="block max-w-[10rem] truncate sm:max-w-[16rem]">
          {p.name}
          {!p.active && <span className="ml-2 text-xs font-normal text-slate-500">(inactive)</span>}
        </span>
      ),
    },
    { key: 'skills', header: 'Skills', filter: 'text', value: (p) => p.skills.map(skillLabel).join(', ') },
    { key: 'pay', header: 'Pay', filter: 'select', value: (p) => (p.tracks_hours ? (p.hourly_rate ? `$${p.hourly_rate}/h` : 'Hourly') : 'Not hourly') },
    { key: 'phone', header: 'Phone', value: (p) => p.phone ?? '' },
    { key: 'login', header: 'Login', filter: 'select', value: (p) => loginState(p).label.replace(/^Last in.*/, 'Signed in'), render: (p) => <StatusPill tone={loginState(p).tone}>{loginState(p).label}</StatusPill> },
    {
      key: 'actions',
      header: 'Actions',
      pinRight: true,
      render: (p) => (
        <Actions>
          <Link href={`/helpers/preview?worker=${p.id}`} className={smallBtn}>
            <Eye className="h-3 w-3" /> Their view
          </Link>
          {p.account && (
            <>
              <button type="button" onClick={() => onAccount(p, { action: 'reset' })} className={smallBtn}>
                <KeyRound className="h-3 w-3" /> New password
              </button>
              <button type="button" onClick={() => onAccount(p, { action: p.account!.disabled_at ? 'enable' : 'disable' })} className={smallBtn}>
                {p.account.disabled_at ? 'Enable login' : 'Disable login'}
              </button>
            </>
          )}
        </Actions>
      ),
    },
  ];

  return (
    <div className="mt-6 grid gap-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {secret && (
        <div className="rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          <div className="font-semibold">Send this to them now. It is not shown again.</div>
          <div className="mt-1 whitespace-pre-line font-mono">{secret}</div>
          <button type="button" onClick={() => setSecret(null)} className="mt-2 text-xs underline">I sent it</button>
        </div>
      )}

      <section className={card}>
        <h2 className="font-semibold">Shared jobs</h2>
        <p className="mb-3 text-xs text-slate-500">Top to bottom is the priority. Tap a job to change its skill, place, who it is with, and what to buy.</p>
        <DataTable
          rows={jobs}
          columns={jobColumns}
          noun={['job', 'jobs']}
          searchPlaceholder="Search shared jobs…"
          groups={jobGroups}
          defaultGroup="type"
          groupAlert={(rows) => ({ count: rows.filter((r) => r.state.label === 'Overdue').length, label: 'overdue' })}
          emptyState={<p className="text-sm text-slate-500">Nothing shared yet.</p>}
          renderExpanded={(r) => (
            <div className="rounded-xl border border-slate-200 bg-white">
              {r.blocked_open && r.blocked_by && (
                <p className="px-3 pt-3 text-xs font-medium text-yellow-800">Hidden from helpers until done: {data.blockerTitles[r.blocked_by] ?? 'another job'}</p>
              )}
              <ItemForm key={r.task_id} row={r} data={data} locationId={data.locationIds[r.task_id] ?? null} onSave={(body) => act('/helpers/api/item', { task_id: r.task_id, ...body })} />
            </div>
          )}
        />
      </section>

      <NewJob data={data} onCreate={(body) => act('/helpers/api/job', body)} />

      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><Share2 className="h-4 w-4" /> Share from your tasks</h2>
        <p className="mb-3 text-xs text-slate-500">Open maintenance and Home &amp; Property jobs due in the next 60 days. Nothing is shared until you tap Share.</p>
        <DataTable
          rows={candidates}
          columns={candidateColumns}
          noun={['task', 'tasks']}
          searchPlaceholder="Search your tasks…"
          groups={[{ key: 'kind', label: 'Type', of: (c) => ({ id: c.kind, label: c.kind }) }]}
          emptyState={<p className="text-sm text-slate-500">Nothing waiting.</p>}
        />
      </section>

      <section className={card}>
        <h2 className="font-semibold">People</h2>
        <p className="mb-3 text-xs text-slate-500">The assignee list. Give someone a login and they can sign in at /h on their phone. Skills decide which jobs they see. Tap a person to edit them.</p>
        {adding && (
          <div className="mb-3 rounded-xl border border-slate-200 p-3">
            <WorkerForm
              worker={null}
              onSave={(body) => {
                act('/helpers/api/worker', body);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
        <DataTable
          rows={people}
          columns={peopleColumns}
          noun={['person', 'people']}
          hideSearch
          actions={
            !adding && (
              <button type="button" onClick={() => setAdding(true)} className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-medium text-blue-700">
                <UserPlus className="h-4 w-4" /> Add a person
              </button>
            )
          }
          emptyState={<p className="text-sm text-slate-500">Nobody yet.</p>}
          renderExpanded={(p) => (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
              {p.notes && <p className="text-xs text-slate-600">{p.notes}</p>}
              {p.account ? (
                <p className="text-xs text-slate-600">Login: {p.account.email}</p>
              ) : (
                <CreateLogin email={p.email ?? ''} onCreate={(email) => onAccount(p, { action: 'create', email })} />
              )}
              <WorkerForm key={p.id} worker={p} onSave={(body) => act('/helpers/api/worker', { id: p.id, ...body })} />
            </div>
          )}
        />
      </section>

      <Applicants data={data} act={act} />

      <Hours data={data} names={names} />
    </div>
  );
}

function AssigneePicker({ data, workerId, name, onChange }: { data: AdminData; workerId: string | null; name: string | null; onChange: (v: { assignee_worker_id: string | null; assignee_name: string | null }) => void }) {
  const [mode, setMode] = useState(workerId ?? (name ? OTHER : ''));
  return (
    <div>
      <label className={label}>
        With
        <select
          className={input}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            if (e.target.value !== OTHER) onChange({ assignee_worker_id: e.target.value || null, assignee_name: null });
          }}
        >
          <option value="">Anyone</option>
          {data.workers.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          <option value={OTHER}>Other…</option>
        </select>
      </label>
      {mode === OTHER && (
        <input className={input} defaultValue={name ?? ''} placeholder="Name" onChange={(e) => onChange({ assignee_worker_id: null, assignee_name: e.target.value })} />
      )}
    </div>
  );
}

function ItemForm({ row, data, locationId, onSave }: { row: WorkRow; data: AdminData; locationId: string | null; onSave: (body: Record<string, unknown>) => void }) {
  const [f, setF] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2">
      <label className={label}>
        Skill needed
        <select className={input} defaultValue={row.skill} onChange={(e) => set('skill', e.target.value)}>
          {SKILLS.map((s) => <option key={s} value={s}>{SKILL_LABELS[s]}</option>)}
        </select>
      </label>
      <label className={label}>
        Where
        <select className={input} defaultValue={locationId ?? ''} onChange={(e) => set('location_asset_id', e.target.value || null)}>
          <option value="">No location</option>
          {data.properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <AssigneePicker data={data} workerId={row.assignee_worker_id} name={row.assignee_name} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked={row.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pin to the top
      </label>
      <label className={`${label} md:col-span-2`}>
        What to do (they see this)
        <textarea className={input} rows={3} defaultValue={row.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} />
      </label>
      <label className={label}>
        What to buy
        <textarea className={input} rows={2} defaultValue={row.materials ?? ''} onChange={(e) => set('materials', e.target.value)} />
      </label>
      <div>
        <label className={label}>
          Gift card
          <input className={input} defaultValue={row.gift_card_note ?? ''} placeholder="e.g. $150 Home Depot card, texted Sat" onChange={(e) => set('gift_card_note', e.target.value)} />
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={Boolean(row.gift_card_sent_at)} onChange={(e) => set('gift_card_sent', e.target.checked)} /> Card sent
        </label>
      </div>
      <div className="flex gap-2 md:col-span-2">
        <button type="button" onClick={() => onSave(f)} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save</button>
        <button type="button" onClick={() => onSave({ shared: false })} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Stop sharing</button>
      </div>
    </div>
  );
}

function NewJob({ data, onCreate }: { data: AdminData; onCreate: (body: Record<string, unknown>) => void }) {
  const [f, setF] = useState<Record<string, unknown>>({ skill: 'helper', location_asset_id: data.properties[0]?.id ?? '' });
  const [openForm, setOpenForm] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  if (!openForm)
    return (
      <button type="button" onClick={() => setOpenForm(true)} className={`${card} flex items-center gap-2 text-left font-semibold text-blue-700`}>
        <Plus className="h-4 w-4" /> Add a job
      </button>
    );
  return (
    <section className={card}>
      <h2 className="font-semibold">Add a job</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={`${label} md:col-span-2`}>
          Job
          <input className={input} onChange={(e) => set('title', e.target.value)} placeholder="Hang the plates in the living room" />
        </label>
        <label className={label}>
          Skill needed
          <select className={input} value={String(f.skill)} onChange={(e) => set('skill', e.target.value)}>
            {SKILLS.map((s) => <option key={s} value={s}>{SKILL_LABELS[s]}</option>)}
          </select>
        </label>
        <label className={label}>
          Where
          <select className={input} value={String(f.location_asset_id ?? '')} onChange={(e) => set('location_asset_id', e.target.value)}>
            <option value="">No location</option>
            {data.properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <AssigneePicker data={data} workerId={null} name={null} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" onChange={(e) => set('pinned', e.target.checked)} /> Pin to the top
        </label>
        <label className={`${label} md:col-span-2`}>
          What to do
          <textarea className={input} rows={3} onChange={(e) => set('instructions', e.target.value)} />
        </label>
        <label className={`${label} md:col-span-2`}>
          What to buy
          <textarea className={input} rows={2} onChange={(e) => set('materials', e.target.value)} />
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button
            type="button"
            onClick={() => {
              onCreate(f);
              setOpenForm(false);
            }}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white"
          >
            Add and share
          </button>
          <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
        </div>
      </div>
    </section>
  );
}

function CreateLogin({ email, onCreate }: { email: string; onCreate: (email: string) => void }) {
  const [loginEmail, setLoginEmail] = useState(email);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">No login yet.</span>
      <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="their email" className="w-56 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <button type="button" onClick={() => onCreate(loginEmail)} className="rounded-lg bg-blue-700 px-2 py-1 text-xs font-medium text-white">Create login</button>
    </div>
  );
}

function WorkerForm({
  worker,
  onSave,
  onCancel,
}: {
  worker: AdminData['workers'][number] | null;
  onSave: (body: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(
    worker
      ? { name: worker.name, phone: worker.phone, email: worker.email, skills: worker.skills, tracks_hours: worker.tracks_hours, hourly_rate: worker.hourly_rate ?? '', notes: worker.notes, active: worker.active }
      : { name: '', skills: ['helper'], tracks_hours: false, active: true },
  );
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const skills = (f.skills as string[]) ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className={label}>Name<input className={input} value={String(f.name ?? '')} onChange={(e) => set('name', e.target.value)} /></label>
      <label className={label}>Phone<input className={input} value={String(f.phone ?? '')} onChange={(e) => set('phone', e.target.value)} /></label>
      <label className={label}>Email<input className={input} value={String(f.email ?? '')} onChange={(e) => set('email', e.target.value)} /></label>
      <label className={label}>Hourly rate ($)<input className={input} inputMode="decimal" value={String(f.hourly_rate ?? '')} onChange={(e) => set('hourly_rate', e.target.value)} /></label>
      <div className="md:col-span-2">
        <div className={label}>Skills (they only see jobs needing these, or assigned to them)</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {SKILLS.map((s) => (
            <label key={s} className="flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 text-xs">
              <input type="checkbox" checked={skills.includes(s)} onChange={(e) => set('skills', e.target.checked ? [...skills, s] : skills.filter((x) => x !== s))} /> {SKILL_LABELS[s]}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(f.tracks_hours)} onChange={(e) => set('tracks_hours', e.target.checked)} /> Clocks in and out (paid by the hour)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label>
      <label className={`${label} md:col-span-2`}>Notes<input className={input} value={String(f.notes ?? '')} onChange={(e) => set('notes', e.target.value)} /></label>
      <div className="flex gap-2 md:col-span-2">
        <button type="button" onClick={() => onSave(f)} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>}
      </div>
    </div>
  );
}

type TimeRow = AdminData['time'][number] & { person: string; minutes: number };
type DoneRow = AdminData['completions'][number] & { person: string };

function Hours({ data, names }: { data: AdminData; names: Map<string, string> }) {
  const byWorker = new Map<string, number>();
  for (const t of data.time) byWorker.set(t.worker_id, (byWorker.get(t.worker_id) ?? 0) + minutesWorked(t.started_at, t.ended_at));
  const rate = new Map(data.workers.map((w) => [w.id, w.hourly_rate]));

  const entries: TimeRow[] = data.time.map((t) => ({ ...t, person: names.get(t.worker_id) ?? 'Unknown', minutes: minutesWorked(t.started_at, t.ended_at) }));
  const entryColumns: DataColumn<TimeRow>[] = [
    { key: 'person', header: 'Person', filter: 'select', sortable: true, pinLeft: true },
    { key: 'task_title', header: 'Job', sortable: true, render: (t) => <span className="block max-w-[14rem] truncate sm:max-w-[22rem]">{t.task_title}</span> },
    { key: 'started_at', header: 'Started', sortable: true, render: (t) => new Date(t.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) },
    { key: 'minutes', header: 'Hours', sortable: true, render: (t) => formatHours(t.minutes) },
    { key: 'state', header: 'State', filter: 'select', value: (t) => (t.ended_at ? 'Clocked out' : 'On the clock'), render: (t) => (t.ended_at ? '' : <StatusPill tone="blue">On the clock</StatusPill>) },
  ];

  const done: DoneRow[] = data.completions.map((c) => ({ ...c, person: c.worker_id ? (names.get(c.worker_id) ?? 'Unknown') : 'You' }));
  const doneColumns: DataColumn<DoneRow>[] = [
    { key: 'task_title', header: 'Job', sortable: true, pinLeft: true, render: (c) => <span className="block max-w-[14rem] truncate sm:max-w-[22rem]">{c.task_title}</span> },
    { key: 'person', header: 'By', filter: 'select', sortable: true },
    { key: 'completed_at', header: 'Done', sortable: true, render: (c) => shortDate(c.completed_at) },
    { key: 'note', header: 'Note', filter: 'text', value: (c) => c.note ?? '', render: (c) => (c.note ? <span className="block max-w-[16rem] truncate">“{c.note}”</span> : '—') },
  ];

  return (
    <section className={card}>
      <h2 className="font-semibold">Hours, last 31 days</h2>
      <div className="mt-2 grid gap-1 text-sm">
        {byWorker.size === 0 && <p className="text-slate-500">No hours logged yet.</p>}
        {[...byWorker].map(([id, mins]) => {
          const r = rate.get(id);
          return (
            <div key={id} className="flex justify-between">
              <span>{names.get(id) ?? 'Unknown'}</span>
              <span className="font-medium">{formatHours(mins)}{r ? ` · $${((mins / 60) * r).toFixed(2)}` : ''}</span>
            </div>
          );
        })}
      </div>
      {entries.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Every entry</h3>
          <DataTable
            rows={entries}
            columns={entryColumns}
            noun={['entry', 'entries']}
            searchPlaceholder="Search entries…"
            groups={[{ key: 'person', label: 'Person', of: (t) => ({ id: t.person, label: t.person }) }]}
          />
        </div>
      )}
      <h3 className="mb-2 mt-5 text-sm font-semibold">Recently done</h3>
      <DataTable
        rows={done}
        columns={doneColumns}
        noun={['job', 'jobs']}
        hideSearch
        groups={[{ key: 'person', label: 'By', of: (c) => ({ id: c.person, label: c.person }) }]}
        emptyState={<p className="text-sm text-slate-500">Nothing yet.</p>}
        renderExpanded={(c) => <p className="text-sm text-slate-700">{c.note ? `“${c.note}”` : 'No note left.'}</p>}
      />
    </section>
  );
}

function Applicants({ data, act }: { data: AdminData; act: (path: string, body: unknown) => void }) {
  const title = new Map(data.postings.map((p) => [p.id, p.title]));
  type Row = AdminData['applications'][number];
  const tone = (s: string) => (s === 'new' ? 'blue' : s === 'contacted' ? 'yellow' : s === 'hired' ? 'green' : 'slate') as 'blue' | 'yellow' | 'green' | 'slate';
  const label = (s: string) => (s === 'declined' ? 'Not a fit' : s[0].toUpperCase() + s.slice(1));
  const columns: DataColumn<Row>[] = [
    { key: 'name', header: 'Name', sortable: true, filter: 'text', pinLeft: true },
    { key: 'status', header: 'Status', sortable: true, filter: 'select', value: (a) => label(a.status), render: (a) => <StatusPill tone={tone(a.status)}>{label(a.status)}</StatusPill> },
    { key: 'phone', header: 'Phone', render: (a) => <a className="text-blue-700" href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>{a.phone}</a> },
    { key: 'license', header: 'License', sortable: true, filter: 'select', value: (a) => (a.drivers_license ? 'Yes' : 'No') },
    { key: 'availability', header: 'Available', filter: 'text', value: (a) => a.availability ?? '' },
    { key: 'heard_from', header: 'Heard via', filter: 'select', value: (a) => a.heard_from ?? '' },
    { key: 'posting', header: 'Job', filter: 'select', value: (a) => title.get(a.posting_id) ?? '' },
    { key: 'created_at', header: 'Applied', sortable: true, value: (a) => a.created_at, render: (a) => new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
    {
      key: 'actions',
      header: '',
      pinRight: true,
      render: (a) => (
        <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!a.worker_id && (
            <button type="button" onClick={() => act('/helpers/api/applicant', { id: a.id, action: 'add' })} className="h-7 rounded-lg bg-blue-700 px-2 text-xs font-medium text-white">Add to people</button>
          )}
          <button type="button" disabled={a.status === 'contacted'} onClick={() => act('/helpers/api/applicant', { id: a.id, action: 'status', status: 'contacted' })} className="h-7 rounded-lg border border-slate-300 px-2 text-xs disabled:opacity-40">Contacted</button>
          <button type="button" disabled={a.status === 'declined'} onClick={() => act('/helpers/api/applicant', { id: a.id, action: 'status', status: 'declined' })} className="h-7 rounded-lg border border-slate-300 px-2 text-xs disabled:opacity-40">Not a fit</button>
        </span>
      ),
    },
  ];
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Applicants</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {data.postings.filter((p) => p.active).map((p) => (
            <a key={p.id} href={`/jobs/${p.slug}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700">Public page: {p.title} ↗</a>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">From the public job page. Applying never creates a login: add someone to People, then create their login there.</p>
      <DataTable
        rows={data.applications}
        columns={columns}
        noun={['applicant', 'applicants']}
        searchPlaceholder="Search applicants…"
        emptyState={<p className="text-sm text-slate-500">No applications yet.</p>}
        renderExpanded={(a) => (
          <div className="grid gap-1 text-sm text-slate-700">
            {a.email && <div>Email: <a className="text-blue-700" href={`mailto:${a.email}`}>{a.email}</a></div>}
            {a.experience && <div className="whitespace-pre-line">Experience: {a.experience}</div>}
          </div>
        )}
      />
    </section>
  );
}
