'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PlanProgress } from '@/lib/spirit/reading-progress';
import { Check, BookOpen, ExternalLink, ChevronDown, ChevronRight, NotebookPen } from 'lucide-react';

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
  progress: PlanProgress;
  /** Reflection already written for the current day, if any. */
  reflection: string;
  recentReflections: Array<{ day: number; content: string }>;
};

export default function ReadingPlans({
  active,
  available,
}: {
  active: ActivePlan[];
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            In progress
          </h2>
          {active.map((plan) => (
            <ActivePlanCard key={plan.subscription_id} plan={plan} onPost={post} busy={busy} />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {active.length > 0 ? 'Other plans' : 'Choose a plan'}
          </h2>
          <div className="space-y-2">
            {available.map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={busy}
                onClick={() => post({ action: 'subscribe', plan_id: plan.id })}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-300 bg-white p-4 text-left shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-50/40 disabled:opacity-60"
              >
                <BookOpen className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-xs text-slate-500">
                    {plan.day_count} days{plan.description ? ` · ${plan.description}` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                  Start
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function ActivePlanCard({
  plan,
  onPost,
  busy,
}: {
  plan: ActivePlan;
  onPost: (payload: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  // Collapsed by default when several plans are running, so the page stays
  // scannable; tapping the header opens the reading rather than a button.
  const [open, setOpen] = useState(true);
  const [reflection, setReflection] = useState(plan.reflection);
  const [savingNote, setSavingNote] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const pct = Math.round((plan.completed_days / plan.plan.day_count) * 100);

  async function saveReflection() {
    setSavingNote(true);
    setSavedNote(false);
    const ok = await onPost({
      action: 'reflect',
      subscription_id: plan.subscription_id,
      day_number: plan.current_day,
      content: reflection,
      passage_label: plan.label,
    });
    setSavingNote(false);
    if (ok) setSavedNote(true);
  }

  const p = plan.progress;

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
      {/* The row expands the passage. The action on the right is a real
          button that marks the day read — it was a <span> inside this same
          toggle, so pressing "Continue" only opened the accordion and nothing
          was ever recorded. */}
      <div className="flex w-full items-center gap-3 p-4 text-left">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{plan.plan.name}</p>
            <p className="text-xs text-slate-500">
              Day {plan.current_day} of {plan.plan.day_count} · {plan.completed_days} read · {pct}%
              {p.streak > 0 && <> · {p.streak}-day streak</>}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </button>

        <button
          type="button"
          disabled={busy || plan.doneToday}
          onClick={() => {
            setOpen(true);
            if (!plan.doneToday) {
              onPost({
                action: 'complete',
                subscription_id: plan.subscription_id,
                day_number: plan.current_day,
              });
            }
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            plan.doneToday
              ? 'bg-emerald-600 text-white'
              : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60'
          }`}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
          {plan.doneToday ? 'Read today' : `Mark day ${plan.current_day}`}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 p-4">
          {/* Pace, and a way out of a backlog. A percentage says how much is
              done but not whether you are keeping up — day 2 of 31 is 3%
              whether that is on schedule or three weeks late. */}
          <div className="mb-4 rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                {p.onTrack ? (
                  <span className="text-emerald-700">On track</span>
                ) : (
                  <span className="text-amber-700">
                    {p.daysBehind} day{p.daysBehind === 1 ? '' : 's'} behind
                  </span>
                )}
                <span className="ml-2 font-normal text-slate-500">
                  {p.completedCount} of {p.dayCount} read
                  {p.longestStreak > 1 && ` · best streak ${p.longestStreak}`}
                </span>
              </p>
              {!p.onTrack && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onPost({ action: 'catch_up', subscription_id: plan.subscription_id })
                  }
                  className="rounded-lg border-2 border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Catch me up
                </button>
              )}
            </div>

            {/* One cell per day. A bar shows a number; this shows which days
                were kept and which were dropped. */}
            <div className="mt-2 flex flex-wrap gap-1">
              {p.days.map((d) => (
                <span
                  key={d.day}
                  title={
                    d.state === 'done'
                      ? `Day ${d.day} — read ${d.completedOn ?? ''}`
                      : d.state === 'today'
                        ? `Day ${d.day} — today`
                        : d.state === 'missed'
                          ? `Day ${d.day} — missed`
                          : `Day ${d.day}`
                  }
                  className={`h-4 w-4 rounded-sm text-[8px] font-bold leading-4 text-center ${
                    d.state === 'done'
                      ? 'bg-emerald-600 text-white'
                      : d.state === 'today'
                        ? 'bg-blue-700 text-white ring-2 ring-blue-300'
                        : d.state === 'missed'
                          ? 'bg-rose-200 text-rose-700'
                          : 'bg-slate-200 text-transparent'
                  }`}
                >
                  {d.day}
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-600" /> read</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-blue-700" /> today</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-rose-200" /> missed</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-200" /> ahead</span>
            </div>
            {!p.onTrack && (
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Catch me up moves the schedule forward to today. It does not mark the skipped days
                read — the record stays honest about what you actually read.
              </p>
            )}
          </div>

          <p className="text-lg font-bold text-slate-900">{plan.label}</p>

          {plan.text ? (
            <>
              <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                {plan.text.content}
              </div>
              {/* Displaying this is a licence condition, not decoration. */}
              <p className="mt-2 text-[10px] leading-snug text-slate-400">{plan.text.copyright}</p>
            </>
          ) : (
            <a
              href={`https://www.bible.com/search/bible?q=${encodeURIComponent(plan.label)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Open in Bible app <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {/* Reflections are mirrored into a note per plan run, so they're
              readable from the notes side and comparable on a re-read. */}
          <div className="mt-4">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <NotebookPen className="h-3.5 w-3.5" />
              Reflection
            </label>
            <textarea
              value={reflection}
              onChange={(e) => {
                setReflection(e.target.value);
                setSavedNote(false);
              }}
              rows={3}
              placeholder="What stood out? Saved to a note for this plan."
              className="mt-1.5 w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-sm focus:border-amber-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveReflection}
                disabled={savingNote || !reflection.trim()}
                className="min-h-[40px] rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {savingNote ? 'Saving…' : 'Save reflection'}
              </button>
              {savedNote && <span className="text-xs font-medium text-emerald-600">Saved to notes</span>}
            </div>
          </div>

          {plan.recentReflections.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Earlier reflections
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {plan.recentReflections.map((r) => (
                  <li key={r.day} className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Day {r.day}:</span>{' '}
                    {r.content.length > 140 ? `${r.content.slice(0, 140)}…` : r.content}
                  </li>
                ))}
              </ul>
              <Link href="/notes" className="mt-2 inline-block text-xs font-medium text-blue-600">
                All notes →
              </Link>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
