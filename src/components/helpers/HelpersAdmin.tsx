'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pin, Plus, Share2, KeyRound, UserPlus, Eye } from 'lucide-react';
import { SKILLS, SKILL_LABELS, helperView, formatHours, minutesWorked, type WorkRow } from '@/lib/helpers/list';

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
};

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';
const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const label = 'block text-xs font-medium text-slate-600';
const OTHER = '__other__';

async function send(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `HTTP ${res.status}`));
  return json;
}

export default function HelpersAdmin({ data }: { data: AdminData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const names = useMemo(() => new Map(data.workers.map((w) => [w.id, w.name])), [data.workers]);
  const shared = data.rows.filter((r) => r.shared);
  // Same ordering the helpers get, with every skill and no due-date window.
  const oneOff = helperView(shared, { worker_id: null, skills: null, includeBlocked: true }, names, data.today).oneOff;
  const maintenance = shared.filter((r) => r.recurrence_rule).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const rowById = new Map(data.rows.map((r) => [r.task_id, r]));

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

  const editor = (r: WorkRow, index: number | null, total: number) => {
    const expanded = open === r.task_id;
    return (
      <div key={r.task_id} className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 p-3">
          <button type="button" onClick={() => setOpen(expanded ? null : r.task_id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            {r.pinned && <Pin className="h-4 w-4 shrink-0 text-blue-600" />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{r.title}</span>
              <span className="block truncate text-xs text-slate-500">
                {SKILL_LABELS[r.skill as keyof typeof SKILL_LABELS] ?? r.skill}
                {r.location_label ? ` · ${r.location_label}` : ' · no location'}
                {r.assignee_worker_id
                  ? ` · ${names.get(r.assignee_worker_id) ?? ''}${r.claimed_at ? ' (took it)' : ''}`
                  : r.assignee_name
                    ? ` · ${r.assignee_name}`
                    : ' · open board'}
                {r.due_date ? ` · due ${r.due_date}` : ''}
              </span>
              {r.blocked_open && r.blocked_by && (
                <span className="block truncate text-xs font-medium text-yellow-800">
                  Hidden from helpers until done: {data.blockerTitles[r.blocked_by] ?? 'another job'}
                </span>
              )}
            </span>
          </button>
          {index !== null && (
            <div className="flex shrink-0 gap-1">
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => act('/helpers/api/order', { task_id: r.task_id, direction: 'up' })} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Move down" disabled={index === total - 1} onClick={() => act('/helpers/api/order', { task_id: r.task_id, direction: 'down' })} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {expanded && <ItemForm row={r} data={data} locationId={data.locationIds[r.task_id] ?? null} onSave={(body) => act('/helpers/api/item', { task_id: r.task_id, ...body })} />}
      </div>
    );
  };

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
        <p className="text-xs text-slate-500">Top to bottom is the priority. Tap a job to change its skill, place, who it is with, and what to buy.</p>
        <div className="mt-3 grid gap-2">
          {oneOff.length === 0 && <p className="text-sm text-slate-500">Nothing shared yet.</p>}
          {oneOff.map((item, i) => editor(rowById.get(item.id)!, i, oneOff.length))}
        </div>
        {maintenance.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold">Maintenance (shows on their list two weeks before it is due)</h3>
            <div className="mt-2 grid gap-2">{maintenance.map((r) => editor(r, null, 0))}</div>
          </>
        )}
      </section>

      <NewJob data={data} onCreate={(body) => act('/helpers/api/job', body)} />

      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><Share2 className="h-4 w-4" /> Share from your tasks</h2>
        <p className="text-xs text-slate-500">Open maintenance and Home &amp; Property jobs due in the next 60 days. Nothing is shared until you tap Share.</p>
        <div className="mt-3 grid gap-2">
          {data.candidates.length === 0 && <p className="text-sm text-slate-500">Nothing waiting.</p>}
          {data.candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm">{c.title}</span>
                <span className="text-xs text-slate-500">{c.recurrence_rule ? 'Maintenance' : 'One-off'}{c.due_date ? ` · due ${c.due_date}` : ''}</span>
              </span>
              <button type="button" onClick={() => act('/helpers/api/item', { task_id: c.id, shared: true })} className="shrink-0 rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white">
                Share
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">People</h2>
        <p className="text-xs text-slate-500">The assignee list. Give someone a login and they can sign in at /h on their phone. Skills decide which jobs they see.</p>
        <div className="mt-3 grid gap-3">
          {data.workers.map((w) => {
            const acct = data.accounts.find((a) => a.worker_id === w.id);
            return (
              <WorkerCard
                key={w.id}
                worker={w}
                account={acct ?? null}
                onSave={(body) => act('/helpers/api/worker', { id: w.id, ...body })}
                onAccount={(body) =>
                  act('/helpers/api/account', { worker_id: w.id, ...body }, (json) => {
                    if (json.password) setSecret(`Sign in at ${window.location.origin}/h\nEmail: ${json.email ?? acct?.email ?? ''}\nPassword: ${json.password}`);
                  })
                }
              />
            );
          })}
          <WorkerCard worker={null} account={null} onSave={(body) => act('/helpers/api/worker', body)} onAccount={() => undefined} />
        </div>
      </section>

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

function WorkerCard({
  worker,
  account,
  onSave,
  onAccount,
}: {
  worker: AdminData['workers'][number] | null;
  account: AdminData['accounts'][number] | null;
  onSave: (body: Record<string, unknown>) => void;
  onAccount: (body: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, unknown>>(
    worker ? { ...worker, hourly_rate: worker.hourly_rate ?? '' } : { name: '', skills: ['helper'], tracks_hours: false, active: true },
  );
  const [loginEmail, setLoginEmail] = useState(worker?.email ?? '');
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const skills = (f.skills as string[]) ?? [];

  if (!worker && !editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-medium text-blue-700">
        <UserPlus className="h-4 w-4" /> Add a person
      </button>
    );

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      {worker && !editing ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{worker.name}{!worker.active && <span className="ml-2 text-xs text-slate-500">(inactive)</span>}</div>
            <div className="text-xs text-slate-500">
              {worker.skills.map((s) => SKILL_LABELS[s as keyof typeof SKILL_LABELS] ?? s).join(', ')}
              {worker.tracks_hours ? ` · clocks hours${worker.hourly_rate ? ` at $${worker.hourly_rate}/h` : ''}` : ''}
              {worker.phone ? ` · ${worker.phone}` : ''}
            </div>
            {worker.notes && <div className="mt-1 text-xs text-slate-600">{worker.notes}</div>}
            <div className="mt-1 text-xs">
              {account ? (
                <span className={account.disabled_at ? 'text-red-700' : 'text-slate-600'}>
                  Login: {account.email}
                  {account.disabled_at ? ' · disabled' : account.last_login_at ? ` · last in ${new Date(account.last_login_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ' · never signed in'}
                </span>
              ) : (
                <span className="text-slate-500">No login</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Edit</button>
            <Link href={`/helpers/preview?worker=${worker.id}`} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"><Eye className="h-3 w-3" /> Their view</Link>
            {account ? (
              <>
                <button type="button" onClick={() => onAccount({ action: 'reset' })} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"><KeyRound className="h-3 w-3" /> New password</button>
                <button type="button" onClick={() => onAccount({ action: account.disabled_at ? 'enable' : 'disable' })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                  {account.disabled_at ? 'Enable login' : 'Disable login'}
                </button>
              </>
            ) : (
              <span className="flex gap-1">
                <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="their email" className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                <button type="button" onClick={() => onAccount({ action: 'create', email: loginEmail })} className="rounded-lg bg-blue-700 px-2 py-1 text-xs font-medium text-white">Create login</button>
              </span>
            )}
          </div>
        </div>
      ) : (
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
            <button type="button" onClick={() => { onSave(f); setEditing(false); }} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Hours({ data, names }: { data: AdminData; names: Map<string, string> }) {
  const byWorker = new Map<string, number>();
  for (const t of data.time) byWorker.set(t.worker_id, (byWorker.get(t.worker_id) ?? 0) + minutesWorked(t.started_at, t.ended_at));
  const rate = new Map(data.workers.map((w) => [w.id, w.hourly_rate]));
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
      {data.time.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-600">Every entry</summary>
          <div className="mt-2 divide-y divide-slate-100">
            {data.time.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{names.get(t.worker_id) ?? '?'}: {t.task_title}</span>
                <span className="shrink-0 text-slate-500">
                  {new Date(t.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {formatHours(minutesWorked(t.started_at, t.ended_at))}{!t.ended_at && ' (on the clock)'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      <h3 className="mt-5 text-sm font-semibold">Recently done</h3>
      <div className="mt-2 divide-y divide-slate-100 text-sm">
        {data.completions.length === 0 && <p className="text-slate-500">Nothing yet.</p>}
        {data.completions.map((c) => (
          <div key={c.id} className="py-1.5">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{c.task_title}</span>
              <span className="shrink-0 text-slate-500">{c.worker_id ? names.get(c.worker_id) : ''} · {new Date(c.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            {c.note && <div className="text-xs text-slate-600">“{c.note}”</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
