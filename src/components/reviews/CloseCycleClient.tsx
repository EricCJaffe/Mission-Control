'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Closing a cycle.
 *
 * A closed cycle is never rescored — `/api/reviews` refuses to recompute one.
 * That is the point: a review is a record of a judgement made at a time, and a
 * closed week that quietly turned green two months later because the task
 * board moved would make the whole history worthless.
 *
 * The button does NOT demand that everything be answered first. A review with
 * two areas left blank and a closing line is still a review; one that cannot
 * be filed until it is perfect is one that stays open forever.
 */
export default function CloseCycleClient({
  cycleId,
  closed,
  summary,
  outstanding,
}: {
  cycleId: string;
  closed: boolean;
  summary: string | null;
  outstanding: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(summary ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(action: 'close' | 'reopen') {
    setError(null);
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, cycle_id: cycleId, summary_md: text }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? 'Could not save.');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        {closed ? 'Closed' : 'Close the period'}
      </h2>

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={closed}
        placeholder="The one sentence you would say about this period."
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
      />

      {!closed && outstanding > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {outstanding} area{outstanding === 1 ? '' : 's'} without an action. You can still
          close — it will show as unanswered in the history.
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => submit(closed ? 'reopen' : 'close')}
          disabled={pending}
          className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            closed
              ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              : 'bg-blue-700 text-white hover:bg-blue-800'
          }`}
        >
          {pending ? 'Saving…' : closed ? 'Reopen' : 'Close this review'}
        </button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
    </section>
  );
}
