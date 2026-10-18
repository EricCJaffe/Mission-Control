'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/*
 * A reading typed in off a vendor's usage page. One per plan per day: saving
 * again the same day replaces it. Chief of Staff's daily Grok reading comes in
 * through the collector's file, not here.
 */

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

export default function ManualEntryForm({ plans, today }: { plans: { slug: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    // datetime-local carries no zone; the browser's own zone is the one meant.
    if (typeof data.resets_at === 'string' && data.resets_at) {
      data.resets_at = new Date(data.resets_at).toISOString();
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/ai-usage/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Save failed (${res.status})`);
      setMessage({ ok: true, text: 'Saved' });
      form.reset();
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Plan
        <select name="plan" required className={input} defaultValue={plans[0]?.slug}>
          {plans.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Day
        <input name="day" type="date" required defaultValue={today} className={input} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Used %
        <input name="used_pct" type="number" min={0} max={1000} step="0.1" className={input} placeholder="e.g. 42" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Resets at
        <input name="resets_at" type="datetime-local" className={input} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Used (optional)
        <input name="used_value" type="number" min={0} step="any" className={input} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Limit (optional)
        <input name="limit_value" type="number" min={0} step="any" className={input} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Unit (optional)
        <input name="unit" maxLength={40} className={input} placeholder="credits, messages" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Note
        <input name="note" maxLength={500} className={input} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save reading'}
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-slate-600' : 'text-red-700'}`}>{message.text}</span>
        )}
      </div>
    </form>
  );
}
