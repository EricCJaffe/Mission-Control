'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MapPin, Pin, ShoppingCart, Gift, User, LogOut, Package } from 'lucide-react';
import { SKILL_LABELS, formatHours, minutesWorked, type HelperItem } from '@/lib/helpers/list';
import { DataTable, StatusPill, type DataColumn, type GroupDef } from '@/components/ui/DataTable';

type Clock = { task_id: string | null; task_title: string; started_at: string } | null;
type Hour = { task_title: string; started_at: string; ended_at: string | null };

const dueText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/* Inside each type: yours, then the open board, then (Eric's preview only) everyone else's. */
const WHO: GroupDef<HelperItem> = {
  key: 'who',
  label: 'Yours / open board',
  of: (i) => (i.mine ? { id: 'mine', label: 'Yours' } : i.board ? { id: 'board', label: 'Open board: anyone can take these' } : { id: 'other', label: 'Assigned to someone' }),
  rank: (id) => ({ mine: 0, board: 1, other: 2 })[id] ?? 3,
};

type HourRow = Hour & { id: string; minutes: number };
const HOUR_COLUMNS: DataColumn<HourRow>[] = [
  { key: 'task_title', header: 'Job', pinLeft: true, render: (h) => <span className="block max-w-[12rem] truncate sm:max-w-[20rem]">{h.task_title}</span> },
  { key: 'started_at', header: 'Day', sortable: true, render: (h) => new Date(h.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
  { key: 'minutes', header: 'Time', sortable: true, render: (h) => (h.ended_at ? formatHours(h.minutes) : <StatusPill tone="blue">{formatHours(h.minutes)} so far</StatusPill>) },
];

/* A big, thumb-sized button. The row itself opens on a tap, so every button stops that. */
const big = 'min-h-[44px] rounded-xl px-4 text-sm font-medium disabled:opacity-60';
/* The in-row button: compact, so a row stays one line of normal height. */
const small = 'h-8 rounded-lg px-3 text-sm font-medium disabled:opacity-60';

/**
 * The helper's list, on a phone. Also rendered for Eric as "what they see",
 * with `preview` set: the same markup, every button inert.
 *
 * One line per job, in the fleet table. On a phone it scrolls sideways; the
 * job name stays on the left and the button on the right. Tap a job to see
 * what to do, what to buy, and to clock in or leave a note.
 */
export default function HelperList({
  name,
  maintenance,
  oneOff,
  tracksHours,
  clock,
  hours,
  supplies,
  preview = false,
}: {
  name: string;
  maintenance: HelperItem[];
  oneOff: HelperItem[];
  tracksHours: boolean;
  clock: Clock;
  hours: Hour[];
  /** Each job's supplies as lines of text, and item names for "we're out of…". */
  supplies?: { byTask: Record<string, string[]>; shelf: Array<{ id: string; name: string }> };
  preview?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  /* True when it saved, so a caller can say so. */
  async function post(path: string, body: unknown, key: string): Promise<boolean> {
    if (preview) return false;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        router.push('/h/login');
        return false;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setConfirming(null);
      setNotes({});
      router.refresh();
      return true;
    } catch (e) {
      setError(`Not saved: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const markDone = (item: HelperItem) => post('/h/api/done', { task_id: item.id, note: notes[item.id] ?? '' }, `done-${item.id}`);
  const weekMinutes = hours.reduce((n, h) => n + minutesWorked(h.started_at, h.ended_at), 0);

  const columns: DataColumn<HelperItem>[] = [
    {
      key: 'title',
      header: 'Job',
      pinLeft: true,
      render: (item) => (
        <span className="flex max-w-[10rem] items-center gap-1.5 text-[15px] sm:max-w-[18rem]">
          {item.pinned && <Pin className="h-4 w-4 shrink-0 text-blue-600" aria-label="Pinned" />}
          <span className="truncate">{item.title}</span>
        </span>
      ),
    },
    { key: 'skill', header: 'Skill', filter: 'select', value: (i) => SKILL_LABELS[i.skill], render: (i) => <StatusPill tone="slate">{SKILL_LABELS[i.skill]}</StatusPill> },
    { key: 'location', header: 'Where', filter: 'select', value: (i) => i.location ?? '', render: (i) => i.location ?? '—' },
    {
      key: 'due_date',
      header: 'Due',
      sortable: true,
      render: (i) => (!i.due_date ? '—' : i.overdue ? <StatusPill tone="red">Overdue: {dueText(i.due_date)}</StatusPill> : dueText(i.due_date)),
    },
    {
      key: 'action',
      header: ' ',
      pinRight: true,
      render: (item) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {item.board ? (
            <button
              type="button"
              disabled={busy !== null || preview}
              onClick={() => post('/h/api/claim', { task_id: item.id, action: 'claim' }, `claim-${item.id}`)}
              className={`${small} border-2 border-blue-700 bg-white text-blue-800`}
            >
              {busy === `claim-${item.id}` ? 'Taking it…' : 'I’ll take it'}
            </button>
          ) : confirming === item.id ? (
            <>
              <button type="button" onClick={() => setConfirming(null)} className={`${small} border border-slate-300 bg-white`}>
                Cancel
              </button>
              <button type="button" disabled={busy !== null || preview} onClick={() => markDone(item)} className={`${small} bg-blue-700 text-white`}>
                {busy === `done-${item.id}` ? 'Saving…' : 'Yes, done'}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={preview}
              onClick={() => setConfirming(item.id)}
              className={`${small} flex items-center gap-1 bg-blue-700 text-white`}
            >
              <Check className="h-4 w-4" /> Done
            </button>
          )}
        </div>
      ),
    },
  ];

  const expanded = (item: HelperItem) => {
    const clockedHere = clock?.task_id === item.id;
    return (
      <div className="max-w-xl space-y-3 text-sm text-slate-700">
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4 shrink-0" />
          {item.board ? 'Open: anyone can take it' : item.mine ? (item.claimed ? 'You took this one' : 'Assigned to you') : item.assignee ? `With ${item.assignee}` : ''}
        </div>
        {item.location && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(item.location)}`} className="flex min-h-[44px] items-center gap-1.5 text-blue-700 underline">
            <MapPin className="h-4 w-4 shrink-0" /> {item.location}: open in maps
          </a>
        )}
        {item.instructions && <p className="whitespace-pre-line text-slate-800">{item.instructions}</p>}
        {item.materials && (
          <div className="flex gap-1.5 rounded-xl bg-white p-2">
            <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" /> <span className="whitespace-pre-line">{item.materials}</span>
          </div>
        )}
        {supplies?.byTask[item.id]?.length ? (
          <div className="flex gap-1.5 rounded-xl bg-white p-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              From the shelf: {supplies.byTask[item.id].join(', ')}
            </span>
          </div>
        ) : null}
        {item.gift_card && (
          <div className="flex gap-1.5 rounded-xl bg-blue-50 p-2 text-blue-900">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" /> {item.gift_card}
          </div>
        )}

        {tracksHours && item.mine && (
          <button
            type="button"
            disabled={busy !== null || preview}
            onClick={() => post('/h/api/clock', { action: clockedHere ? 'out' : 'in', task_id: item.id }, `clock-${item.id}`)}
            className={`${big} w-full border ${clockedHere ? 'border-yellow-400 bg-yellow-50 text-yellow-900' : 'border-slate-300 bg-white text-slate-700'}`}
          >
            {clockedHere ? 'Clock out' : 'Clock in'}
          </button>
        )}

        <div className="space-y-2">
          <textarea
            value={notes[item.id] ?? ''}
            onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
            placeholder="Anything Eric should know? (optional)"
            className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm"
            rows={2}
            disabled={preview}
          />
          <button type="button" disabled={busy !== null || preview} onClick={() => markDone(item)} className={`${big} flex w-full items-center justify-center gap-1 bg-blue-700 text-white`}>
            <Check className="h-4 w-4" /> {busy === `done-${item.id}` ? 'Saving…' : 'It’s done'}
          </button>
        </div>

        {item.mine && (
          <button
            type="button"
            disabled={busy !== null || preview}
            onClick={() => post('/h/api/claim', { task_id: item.id, action: 'release' }, `release-${item.id}`)}
            className="min-h-[44px] w-full text-center text-xs text-slate-500 underline disabled:opacity-60"
          >
            Can’t get to it? Put it back on the board
          </button>
        )}
      </div>
    );
  };

  const table = (items: HelperItem[], empty: string) => (
    <div className="mt-3">
      <DataTable
        rows={items}
        columns={columns}
        noun={['job', 'jobs']}
        hideSearch
        groups={[WHO]}
        defaultGroup="who"
        groupAlert={(rows) => ({ count: rows.filter((r) => r.overdue).length, label: 'overdue' })}
        emptyState={<p className="text-sm text-slate-500">{empty}</p>}
        renderExpanded={expanded}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Work list</h1>
          <p className="text-sm text-slate-500">{preview ? `Preview: what ${name} sees` : `Hi, ${name}`}</p>
        </div>
        {!preview && (
          <button
            type="button"
            onClick={async () => {
              await fetch('/h/api/logout', { method: 'POST' });
              router.push('/h/login');
            }}
            className="flex min-h-[44px] items-center gap-1 text-sm text-slate-500"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        )}
      </div>

      {tracksHours && clock && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <span>
            On the clock since {new Date(clock.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}: {clock.task_title}
          </span>
          <button
            type="button"
            disabled={busy !== null || preview}
            onClick={() => post('/h/api/clock', { action: 'out' }, 'clock-out')}
            className="min-h-[44px] shrink-0 rounded-xl bg-yellow-600 px-3 font-medium text-white disabled:opacity-60"
          >
            Clock out
          </button>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <p className="mt-4 text-sm text-slate-500">Tap a job to see what to do and what to buy.</p>

      <section className="mt-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Routine maintenance coming due</h2>
        <p className="text-xs text-slate-500">Shows up two weeks before it is due.</p>
        {table(maintenance, 'Nothing due in the next two weeks.')}
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">One-off jobs and upgrades</h2>
        <p className="text-xs text-slate-500">Top of the list first. Pinned jobs matter most.</p>
        {table(oneOff, 'No jobs right now.')}
      </section>

      <OutOf shelf={supplies?.shelf ?? []} disabled={busy !== null || preview} onSend={(body) => post('/h/api/supply', body, 'supply')} />

      {tracksHours && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Your hours, last 14 days</h2>
          <p className="mt-1 text-sm font-semibold">{formatHours(weekMinutes)}</p>
          <div className="mt-2">
            <DataTable
              rows={hours.map((h) => ({ ...h, id: h.started_at, minutes: minutesWorked(h.started_at, h.ended_at) }))}
              columns={HOUR_COLUMNS}
              noun={['entry', 'entries']}
              hideSearch
              emptyState={<p className="text-sm text-slate-500">No hours yet.</p>}
            />
          </div>
        </section>
      )}
    </div>
  );
}

/*
 * "Used the last of something?" The person holding the empty bottle is the
 * only one who knows, so they put it on Eric's shopping list from here.
 */
function OutOf({ shelf, disabled, onSend }: { shelf: Array<{ id: string; name: string }>; disabled: boolean; onSend: (body: Record<string, string>) => Promise<boolean> }) {
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const OTHER = '__other__';
  const ctl = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';
  const ready = pick === OTHER ? name.trim() : pick;
  return (
    <section className="mt-8 rounded-2xl border-2 border-slate-300 bg-white p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShoppingCart className="h-4 w-4 text-blue-700" /> Used the last of something?
      </h2>
      <p className="text-sm text-slate-500">Put it on the shopping list so it gets bought.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select aria-label="What ran out" className={ctl} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Pick an item…</option>
          {shelf.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value={OTHER}>Something else…</option>
        </select>
        {pick === OTHER && <input aria-label="Item" className={ctl} placeholder="What do we need?" value={name} onChange={(e) => setName(e.target.value)} />}
        <input aria-label="Note" className={ctl} placeholder="Note (optional): size, brand" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          type="button"
          disabled={disabled || !ready}
          className="min-h-[44px] rounded-xl bg-blue-700 px-4 text-sm font-medium text-white disabled:opacity-60"
          onClick={async () => {
            const label = pick === OTHER ? name.trim() : (shelf.find((s) => s.id === pick)?.name ?? '');
            if (!(await onSend(pick === OTHER ? { name: name.trim(), note } : { supply_id: pick, note }))) return;
            setSent(label);
            setPick('');
            setName('');
            setNote('');
          }}
        >
          Add to shopping list
        </button>
      </div>
      {sent && <p className="mt-2 text-sm text-green-700">Added: {sent}. Thanks.</p>}
    </section>
  );
}
