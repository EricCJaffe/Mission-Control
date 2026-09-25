'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, AlertTriangle, RotateCcw } from 'lucide-react';
import type { Checklist } from '@/lib/rv/checklists';

/**
 * One checklist, run on a phone, one-handed, outside, usually with gloves.
 *
 * - The whole row is the tap target (min 56px), not the little box.
 * - Each tap is written to the server immediately and ticked optimistically;
 *   if the write fails the tick comes back off and the header says so, so a
 *   step is never shown done that the database does not have.
 * - Reset is behind an in-page confirm, never a browser dialog, and archives
 *   the run rather than deleting it.
 */
export default function RvChecklist({
  checklist,
  initialChecked,
  location,
}: {
  checklist: Checklist;
  initialChecked: string[];
  location: string | null;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialChecked));
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const total = useMemo(() => checklist.sections.reduce((n, s) => n + s.items.length, 0), [checklist]);
  const done = useMemo(
    () => checklist.sections.reduce((n, s) => n + s.items.filter((i) => checked.has(i.id)).length, 0),
    [checklist, checked],
  );
  const percent = total ? Math.round((done / total) * 100) : 0;

  async function toggle(itemId: string) {
    const next = !checked.has(itemId);
    setChecked((prev) => {
      const s = new Set(prev);
      if (next) s.add(itemId);
      else s.delete(itemId);
      return s;
    });
    setError(null);
    try {
      const res = await fetch(`/rv/checklists/${checklist.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, checked: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    } catch (e) {
      // Put it back the way the server has it, and say so.
      setChecked((prev) => {
        const s = new Set(prev);
        if (next) s.delete(itemId);
        else s.add(itemId);
        return s;
      });
      setError(`Not saved — ${(e as Error).message}. Tap again.`);
    }
  }

  async function reset() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/rv/checklists/${checklist.id}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setChecked(new Set());
      setConfirmReset(false);
    } catch (e) {
      setError(`Reset failed — ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="pb-24">
      {/* Sticky: progress and Reset stay under the thumb however far down the list is. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-3 backdrop-blur md:mx-0 md:rounded-b-2xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/rv" className="flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
            <ArrowLeft className="h-4 w-4" /> RV
          </Link>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">{checklist.title}</h1>
          <span className={`text-sm font-semibold ${done === total ? 'text-green-700' : 'text-slate-700'}`}>
            {done} / {total}
          </span>
        </div>
        {location && <div className="text-xs text-slate-500">{location}</div>}
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${done === total ? 'bg-green-600' : 'bg-blue-600'}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {confirmReset && (
          <div className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
            <p className="text-sm text-slate-700">
              Start a fresh {checklist.title.toLowerCase()}? This run ({done} of {total}) is saved to the history.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={reset}
                className="min-h-[44px] flex-1 rounded-xl bg-blue-700 text-sm font-medium text-white disabled:opacity-60"
              >
                {resetting ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {checklist.sections.map((section, si) => {
        const sectionDone = section.items.filter((i) => checked.has(i.id)).length;
        return (
          <section key={section.id} className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                {si + 1}. {section.title}
              </h2>
              <span className="text-xs text-slate-500">
                {sectionDone}/{section.items.length}
              </span>
            </div>
            {section.warning && (
              <div className="mt-2 flex gap-2 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{section.warning}</span>
              </div>
            )}
            <div className="mt-2 grid gap-2">
              {section.items.map((item) => {
                const on = checked.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={on}
                    className={`flex min-h-[56px] w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      on ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white active:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        on ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {on && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[15px] font-medium ${on ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                        {item.text}
                      </span>
                      {item.note && <span className="mt-0.5 block text-sm text-slate-500">{item.note}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {done === total && (
        <div className="mt-8 rounded-2xl border border-green-300 bg-green-50 p-4 text-center text-sm font-medium text-green-800">
          All {total} done. Reset when you start the next one.
        </div>
      )}
    </div>
  );
}
