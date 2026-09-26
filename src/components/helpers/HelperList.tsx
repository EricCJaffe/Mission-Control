'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, MapPin, Pin, ShoppingCart, Gift, User, LogOut, AlertTriangle } from 'lucide-react';
import { SKILL_LABELS, formatHours, minutesWorked, type HelperItem } from '@/lib/helpers/list';

type Clock = { task_id: string | null; task_title: string; started_at: string } | null;
type Hour = { task_title: string; started_at: string; ended_at: string | null };

/**
 * The helper's list, on a phone. Also rendered for Eric as "what they see",
 * with `preview` set: the same markup, every button inert.
 */
export default function HelperList({
  name,
  maintenance,
  oneOff,
  tracksHours,
  clock,
  hours,
  preview = false,
}: {
  name: string;
  maintenance: HelperItem[];
  oneOff: HelperItem[];
  tracksHours: boolean;
  clock: Clock;
  hours: Hour[];
  preview?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function post(path: string, body: unknown, key: string) {
    if (preview) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        router.push('/h/login');
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setConfirming(null);
      setNote('');
      router.refresh();
    } catch (e) {
      setError(`Not saved: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /* Inside each type: yours, then the open board, then (Eric's preview only) everyone else's. */
  const groups = (items: HelperItem[], empty: string) => {
    if (!items.length) return <p className="mt-2 text-sm text-slate-500">{empty}</p>;
    const parts: Array<[string, HelperItem[]]> = [
      ['Yours', items.filter((i) => i.mine)],
      ['Open board: anyone can take these', items.filter((i) => i.board)],
      ['Assigned to someone', items.filter((i) => !i.mine && !i.board)],
    ];
    return parts
      .filter(([, list]) => list.length)
      .map(([heading, list]) => (
        <div key={heading} className="mt-3">
          <h3 className="text-sm font-semibold text-slate-700">{heading}</h3>
          <div className="mt-2 grid gap-3">{list.map(card)}</div>
        </div>
      ));
  };

  const weekMinutes = hours.reduce((n, h) => n + minutesWorked(h.started_at, h.ended_at), 0);

  const card = (item: HelperItem) => {
    const clockedHere = clock?.task_id === item.id;
    return (
      <div key={item.id} className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${item.pinned ? 'border-blue-300' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[15px] font-semibold text-slate-900">
            {item.pinned && <Pin className="mr-1 inline h-4 w-4 text-blue-600" />}
            {item.title}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{SKILL_LABELS[item.skill]}</span>
        </div>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {item.location && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(item.location)}`} className="flex items-center gap-1.5 text-blue-700">
              <MapPin className="h-4 w-4 shrink-0" /> {item.location}
            </a>
          )}
          {item.due_date && (
            <div className={`flex items-center gap-1.5 ${item.overdue ? 'font-medium text-red-700' : ''}`}>
              {item.overdue ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              {item.overdue ? 'Overdue since' : 'Due'} {new Date(`${item.due_date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
          {item.board ? (
            <div className="flex items-center gap-1.5 text-green-700">
              <User className="h-4 w-4" /> Open: anyone can take it
            </div>
          ) : (
            item.assignee && (
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" /> {item.mine ? (item.claimed ? 'You took this one' : 'Assigned to you') : `With ${item.assignee}`}
              </div>
            )
          )}
        </div>
        {item.instructions && <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{item.instructions}</p>}
        {item.materials && (
          <div className="mt-2 flex gap-1.5 rounded-xl bg-slate-50 p-2 text-sm text-slate-700">
            <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" /> <span className="whitespace-pre-line">{item.materials}</span>
          </div>
        )}
        {item.gift_card && (
          <div className="mt-2 flex gap-1.5 rounded-xl bg-green-50 p-2 text-sm text-green-800">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" /> {item.gift_card}
          </div>
        )}

        {confirming === item.id ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything Eric should know? (optional)"
              className="w-full rounded-xl border border-slate-300 p-2 text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="min-h-[44px] flex-1 rounded-xl border border-slate-300 text-sm font-medium">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy !== null || preview}
                onClick={() => post('/h/api/done', { task_id: item.id, note }, `done-${item.id}`)}
                className="min-h-[44px] flex-1 rounded-xl bg-blue-700 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === `done-${item.id}` ? 'Saving…' : 'Yes, it’s done'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.board && (
              <button
                type="button"
                disabled={busy !== null || preview}
                onClick={() => post('/h/api/claim', { task_id: item.id, action: 'claim' }, `claim-${item.id}`)}
                className="min-h-[44px] flex-1 rounded-xl border-2 border-blue-700 text-sm font-medium text-blue-800 disabled:opacity-60"
              >
                {busy === `claim-${item.id}` ? 'Taking it…' : 'I’ll take it'}
              </button>
            )}
            {tracksHours && item.mine && (
              <button
                type="button"
                disabled={busy !== null || preview}
                onClick={() => post('/h/api/clock', { action: clockedHere ? 'out' : 'in', task_id: item.id }, `clock-${item.id}`)}
                className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium disabled:opacity-60 ${
                  clockedHere ? 'border-yellow-400 bg-yellow-50 text-yellow-900' : 'border-slate-300 text-slate-700'
                }`}
              >
                {clockedHere ? 'Clock out' : 'Clock in'}
              </button>
            )}
            <button
              type="button"
              disabled={preview}
              onClick={() => setConfirming(item.id)}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-blue-700 text-sm font-medium text-white disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> Mark done
            </button>
            {item.mine && (
              <button
                type="button"
                disabled={busy !== null || preview}
                onClick={() => post('/h/api/claim', { task_id: item.id, action: 'release' }, `release-${item.id}`)}
                className="w-full text-center text-xs text-slate-500 underline disabled:opacity-60"
              >
                Can’t get to it? Put it back on the board
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-4">
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

      <section className="mt-6">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Routine maintenance coming due</h2>
        <p className="text-xs text-slate-500">Shows up two weeks before it is due.</p>
        {groups(maintenance, 'Nothing due in the next two weeks.')}
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">One-off jobs and upgrades</h2>
        <p className="text-xs text-slate-500">Top of the list first. Pinned jobs matter most.</p>
        {groups(oneOff, 'No jobs right now.')}
      </section>

      {tracksHours && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Your hours, last 14 days</h2>
          <p className="mt-1 text-sm font-semibold">{formatHours(weekMinutes)}</p>
          <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
            {hours.length === 0 && <p className="p-3 text-slate-500">No hours yet.</p>}
            {hours.map((h) => (
              <div key={h.started_at} className="flex justify-between gap-2 p-3">
                <span className="min-w-0 truncate">{h.task_title}</span>
                <span className="shrink-0 text-slate-500">
                  {new Date(h.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {formatHours(minutesWorked(h.started_at, h.ended_at))}
                  {!h.ended_at && ' (open)'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
