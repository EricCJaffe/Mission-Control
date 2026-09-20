'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { formatValue, styleFor, unitLabelFor } from '@/lib/reviews/status';
import { needsAction, type ProjectLine, type ReviewReading } from '@/lib/reviews/types';
import { StatusPill } from '@/components/reviews/StatusPill';

/**
 * Working one reading.
 *
 * The ask is deliberately small and it is the same every time: a line on what
 * happened, and the one thing that would fix it. Anything not green wants the
 * second field; green wants nothing at all and says so, because a review that
 * demands a paragraph about a week that went fine is a review that stops being
 * done.
 *
 * Saving is optimistic-free on purpose: the number can change as a result of
 * the save (a manual value is rescored server-side against this reading's own
 * stored line), so the page refreshes rather than guessing what the server
 * decided. Guessing the color is exactly how a tile ends up lying.
 */
export default function ReviewWorkClient({
  reading,
  readOnly,
}: {
  reading: ReviewReading;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(reading.note_md ?? '');
  const [action, setAction] = useState(reading.action_md ?? '');
  const [value, setValue] = useState(
    reading.has_reading && reading.value !== null ? String(reading.value) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const style = styleFor(reading.status);
  const unit = unitLabelFor(reading.unit);
  const manual = (reading.detail as { entered?: boolean })?.entered !== undefined;
  const projects = ((reading.detail as { projects?: ProjectLine[] })?.projects ?? []) as ProjectLine[];

  async function save(includeValue: boolean) {
    setError(null);
    setSaved(false);
    const body: Record<string, unknown> = {
      action: 'reading',
      reading_id: reading.id,
      note_md: note,
      action_md: action,
    };
    if (includeValue) body.value = value === '' ? null : value;

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Could not save.');
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <section
      id={reading.area_key}
      className={`scroll-mt-20 rounded-2xl border-2 bg-white p-5 shadow-sm ${style.border}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{reading.label}</h2>
          <p className={`mt-0.5 text-sm ${style.text}`}>{reading.status_reason}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {reading.has_reading && reading.value !== null
                ? `${formatValue(Number(reading.value))}${unit ?? ''}`
                : '—'}
            </div>
            {reading.target !== null && (
              <div className="text-[11px] text-slate-400">
                line {formatValue(Number(reading.target))}
                {unit}
              </div>
            )}
          </div>
          <StatusPill status={reading.status} carried={reading.carried_cycles} size="lg" />
        </div>
      </div>

      {/* The one number on the page that cannot be read off this week alone. */}
      {reading.carried_cycles > 1 && reading.status !== 'green' && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
          {reading.carried_cycles} periods running at {styleFor(reading.status).label.toLowerCase()}.
          {reading.status === 'red' ? ' This is not a bad week — it is a decision being avoided.' : ''}
        </p>
      )}

      {projects.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {projects.slice(0, 8).map((line) => (
            <li key={line.id} className="flex items-center gap-2 text-xs">
              <span aria-hidden className={styleFor(line.status).text}>
                {styleFor(line.status).glyph}
              </span>
              <span className="font-medium">{line.title}</span>
              <span className="text-slate-500">{line.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-4 grid gap-3">
          {manual && (
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                The reading {unit ? `(${unit})` : ''}
              </span>
              <input
                type="number"
                step="0.5"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => save(true)}
                placeholder="Blank stays red"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              What happened
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One line. Optional."
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {reading.status !== 'green' && reading.status !== 'not_due' && (
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                The one thing that would fix it
              </span>
              <textarea
                rows={2}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Goes on this week's agenda, not next quarter's."
                className={`rounded-lg border px-3 py-2 text-sm ${
                  needsAction(reading) ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300'
                }`}
              />
            </label>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => save(manual)}
              disabled={pending}
              className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {saved && !error && <span className="text-xs text-emerald-700">Saved.</span>}
            {error && <span className="text-xs text-rose-700">{error}</span>}
          </div>
        </div>
      )}

      {readOnly && (note || action) && (
        <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm">
          {note && <p className="text-slate-700">{note}</p>}
          {action && (
            <p className="border-l-2 border-slate-300 pl-3 italic text-slate-600">{action}</p>
          )}
        </div>
      )}
    </section>
  );
}
