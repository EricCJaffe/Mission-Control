'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MessageSquareText, Pencil, Trash2, X } from 'lucide-react';
import type { PrayerLogEntry } from '@/lib/spirit/prayer';
import { today } from '@/lib/day';

/**
 * A prayer's history: every time it was prayed, and everything written about it.
 *
 * The module already recorded checkmarks, but a row of thirty-six identical
 * timestamps is not something anyone rereads. What makes a prayer journal worth
 * keeping is the handful of entries where you wrote down what was actually
 * happening — "surgery went well, still no word on the biopsy" — and until now
 * the only way to attach words to a prayer was to mark it answered and remove
 * it from the list.
 *
 * So a reflection is deliberately not a closing action. It does not advance the
 * rotation, does not touch prayed_count, and does not take the item off today's
 * list. You can write about something you are still carrying.
 *
 * Both kinds live on one timeline because that is how it gets reread: not "show
 * me the notes", but "what was going on with this last spring".
 */

const FIELD =
  'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

/** Day headings, with today and yesterday named rather than dated. */
function dayLabel(iso: string): string {
  const day = new Date(iso);
  const stamp = day.toLocaleDateString('en-CA');
  const todayIso = today();
  if (stamp === todayIso) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (stamp === yesterday.toLocaleDateString('en-CA')) return 'Yesterday';

  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: day.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export default function PrayerHistory({
  requestId,
  onChanged,
}: {
  requestId: string;
  /** Lets the parent refresh counts once an entry is written. */
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<PrayerLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [date, setDate] = useState(() => today());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/spirit/prayer?log_for=${requestId}`);
    const data = await res.json().catch(() => ({ logs: [] }));
    setEntries(data.logs ?? []);
  }, [requestId]);

  // Fetched on open rather than on mount — the list would otherwise fire one
  // request per card to populate a panel most of them never show.
  useEffect(() => {
    load();
  }, [load]);

  async function send(payload: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/spirit/prayer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not save that');
        return false;
      }
      await load();
      onChanged?.();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function addReflection() {
    if (!draft.trim()) return;
    const ok = await send({ id: requestId, action: 'note', note: draft, date });
    if (ok) {
      setDraft('');
      setDate(today());
    }
  }

  const notes = entries?.filter((e) => e.kind === 'note').length ?? 0;

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Add a reflection
        </label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          A note on where this stands. It does not mark the prayer as prayed and does not
          take it off today&apos;s list.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Where this stands today…"
          className={`${FIELD} mt-1.5`}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date for this reflection"
            className="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addReflection}
            disabled={saving || !draft.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquareText className="h-3.5 w-3.5" />
            )}
            Save reflection
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      <div className="mt-3 border-t border-slate-200 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          History
          {notes > 0 && (
            <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
              {notes} reflection{notes === 1 ? '' : 's'}
            </span>
          )}
        </p>

        {entries === null ? (
          <p className="mt-1 text-xs text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            Nothing recorded yet. The first reflection is the one worth writing.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    entry.kind === 'prayed'
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                  aria-hidden
                >
                  {entry.kind === 'prayed' ? (
                    <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                  ) : (
                    <MessageSquareText className="h-2.5 w-2.5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-slate-500">
                    {dayLabel(entry.prayed_at)}
                    <span className="ml-1 font-normal text-slate-400">
                      {entry.kind === 'prayed' ? 'prayed' : 'reflection'}
                    </span>
                  </p>

                  {editingId === entry.id ? (
                    <div className="mt-1">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        className={FIELD}
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          disabled={saving || !editDraft.trim()}
                          onClick={async () => {
                            const ok = await send({
                              id: entry.id,
                              action: 'edit_log',
                              note: editDraft,
                            });
                            if (ok) setEditingId(null);
                          }}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => send({ id: entry.id, action: 'delete_log' })}
                          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    entry.note && (
                      <p className="text-xs text-slate-700">{entry.note}</p>
                    )
                  )}
                </div>

                {/* Only reflections are editable. A checkmark is a record that
                    something happened on a day; rewriting it would make the
                    rotation's own bookkeeping negotiable. */}
                {entry.kind === 'note' && editingId !== entry.id && (
                  <button
                    type="button"
                    aria-label="Edit reflection"
                    onClick={() => {
                      setEditingId(entry.id);
                      setEditDraft(entry.note ?? '');
                    }}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Small close affordance shared by the callers that render this in a panel. */
export function HistoryCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close history"
      className="text-slate-400 hover:text-slate-600"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
