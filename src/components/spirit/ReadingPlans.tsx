'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, BookOpen, ExternalLink } from 'lucide-react';

export type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  day_count: number;
};

export type ActivePlan = {
  subscription_id: string;
  plan: PlanRow;
  current_day: number;
  completed_days: number;
  label: string;
  passages: string[];
  /** Null when no Bible API key is configured — references still render. */
  text: { content: string; copyright: string; reference: string } | null;
  doneToday: boolean;
};

export default function ReadingPlans({
  active,
  available,
}: {
  active: ActivePlan | null;
  available: PlanRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/spirit/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {active && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{active.plan.name}</p>
              <p className="text-xs text-slate-500">
                Day {active.current_day} of {active.plan.day_count} · {active.completed_days} read
              </p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {Math.round((active.completed_days / active.plan.day_count) * 100)}%
            </span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${(active.completed_days / active.plan.day_count) * 100}%` }}
            />
          </div>

          <p className="mt-4 text-lg font-bold text-slate-900">{active.label}</p>

          {active.text ? (
            <>
              <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                {active.text.content}
              </div>
              {/* Displaying this is a licence condition, not decoration. */}
              <p className="mt-2 text-[10px] leading-snug text-slate-400">{active.text.copyright}</p>
            </>
          ) : (
            <a
              href={`https://www.bible.com/search/bible?q=${encodeURIComponent(active.label)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Open in Bible app <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            disabled={busy || active.doneToday}
            onClick={() =>
              post({
                action: 'complete',
                subscription_id: active.subscription_id,
                day_number: active.current_day,
              })
            }
            className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              active.doneToday
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60'
            }`}
          >
            <Check className="h-4 w-4" strokeWidth={3} />
            {active.doneToday ? 'Read today' : 'Mark day read'}
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {active ? 'Other plans' : 'Choose a plan'}
        </h2>
        <div className="space-y-2">
          {available.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm"
            >
              <BookOpen className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="text-xs text-slate-500">
                  {plan.day_count} days{plan.description ? ` · ${plan.description}` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ action: 'subscribe', plan_id: plan.id })}
                className="shrink-0 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
              >
                Start
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
