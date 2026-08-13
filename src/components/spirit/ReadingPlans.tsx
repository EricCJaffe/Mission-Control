'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PlanProgress } from '@/lib/spirit/reading-progress';
import {
  Check,
  BookOpen,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
} from 'lucide-react';

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
  recentReflections: Array<{
    day: number;
    content: string;
    passageLabel: string | null;
    writtenOn: string | null;
  }>;
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

/** One day of a plan run, as shown in the card. */
type DayView = {
  day: number;
  label: string;
  text: ActivePlan['text'];
  reflection: string;
  completedOn: string | null;
};

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

  /*
   * Which day is on screen. Null means "follow the plan" — so marking a day
   * read moves the card forward on its own, while an explicitly chosen day
   * stays put until you come back to today.
   */
  const [viewDay, setViewDay] = useState<number | null>(null);
  // Stamped with the day it answers, so "still loading" is derived from a
  // mismatch rather than tracked as its own flag. `data: null` means the
  // fetch settled but failed.
  const [fetched, setFetched] = useState<{ day: number; data: DayView | null } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const p = plan.progress;
  const requestedDay = viewDay ?? plan.current_day;
  const isCurrent = requestedDay === plan.current_day;

  // The current day is already rendered by the server, text and all. Any other
  // day is fetched, because its passage isn't in the page payload.
  useEffect(() => {
    // Nothing to fetch for the current day — the server already rendered it,
    // and `view` below prefers those props, so a stale loadedDay is inert.
    if (isCurrent) return;
    let cancelled = false;
    fetch(
      `/api/spirit/reading/day?subscription_id=${encodeURIComponent(
        plan.subscription_id
      )}&day=${requestedDay}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setFetched({ day: requestedDay, data: d?.error ? null : (d as DayView) });
        }
      })
      .catch(() => {
        if (!cancelled) setFetched({ day: requestedDay, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [isCurrent, requestedDay, plan.subscription_id, reloadToken]);

  const currentCompletedOn = p.days.find((d) => d.day === plan.current_day)?.completedOn ?? null;
  const settled = !isCurrent && fetched?.day === requestedDay ? fetched : null;
  const view: DayView = isCurrent
    ? {
        day: plan.current_day,
        label: plan.label,
        text: plan.text,
        reflection: plan.reflection,
        completedOn: currentCompletedOn,
      }
    : (settled?.data ?? {
        day: requestedDay,
        label: '',
        text: null,
        reflection: '',
        completedOn: null,
      });
  const ready = isCurrent || settled !== null;
  const loadFailed = settled !== null && settled.data === null;
  const viewDayDone = view.completedOn !== null;

  const pct = Math.round((plan.completed_days / plan.plan.day_count) * 100);

  async function markRead() {
    const ok = await onPost({
      action: 'complete',
      subscription_id: plan.subscription_id,
      day_number: view.day,
    });
    // A day marked from the back-catalogue needs its own state refetched —
    // router.refresh() only re-renders the server's idea of the current day.
    if (ok && !isCurrent) setReloadToken((t) => t + 1);
  }

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
              {plan.doneToday && !p.currentDayDone && (
                <span className="font-medium text-emerald-700"> · read today</span>
              )}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </button>

        {/* Gated on THIS day being read, not on anything having been read
            today. Reading two days back to back is how you get back on pace —
            the old check disabled the button after the first one, so catching
            up was impossible. */}
        <button
          type="button"
          disabled={busy || !ready || viewDayDone}
          onClick={() => {
            setOpen(true);
            if (!viewDayDone) markRead();
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            viewDayDone ? 'bg-emerald-600 text-white' : 'bg-blue-700 text-white hover:bg-blue-800'
          }`}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
          {viewDayDone ? `Read ${view.completedOn}` : `Mark day ${view.day}`}
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
                were kept and which were dropped — and each cell opens that
                day's passage and what you wrote about it. */}
            <div className="mt-2 flex flex-wrap gap-1">
              {p.days.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setViewDay(d.day === plan.current_day ? null : d.day)}
                  title={
                    d.state === 'done'
                      ? `Day ${d.day} — read ${d.completedOn ?? ''}`
                      : d.state === 'today'
                        ? `Day ${d.day} — today`
                        : d.state === 'missed'
                          ? `Day ${d.day} — missed`
                          : `Day ${d.day}`
                  }
                  aria-label={`Open day ${d.day}`}
                  aria-current={d.day === view.day ? 'true' : undefined}
                  className={`h-5 w-5 rounded-sm text-[9px] font-bold leading-5 text-center transition-transform hover:scale-110 ${
                    d.state === 'done'
                      ? 'bg-emerald-600 text-white'
                      : d.state === 'today'
                        ? 'bg-blue-700 text-white'
                        : d.state === 'missed'
                          ? 'bg-rose-200 text-rose-700'
                          : 'bg-slate-200 text-slate-400'
                  } ${d.day === view.day ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                >
                  {d.day}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-600" /> read</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-blue-700" /> today</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-rose-200" /> missed</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-200" /> ahead</span>
              <span className="text-slate-400">· tap a day to open it</span>
            </div>
            {!p.onTrack && (
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                Catch me up moves the schedule forward to today. It does not mark the skipped days
                read — the record stays honest about what you actually read.
              </p>
            )}
          </div>

          {/* Walking back through the plan. Re-reading Tuesday's chapter, or
              what you wrote about it, shouldn't mean leaving the page. */}
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              disabled={view.day <= 1}
              onClick={() => setViewDay(Math.max(1, view.day - 1))}
              aria-label="Previous day"
              className="rounded-lg border-2 border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={view.day >= plan.plan.day_count}
              onClick={() =>
                setViewDay(
                  Math.min(plan.plan.day_count, view.day + 1) === plan.current_day
                    ? null
                    : Math.min(plan.plan.day_count, view.day + 1)
                )
              }
              aria-label="Next day"
              className="rounded-lg border-2 border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Day {view.day}
              {viewDayDone && view.completedOn && (
                <span className="ml-2 font-normal normal-case tracking-normal text-emerald-700">
                  read {view.completedOn}
                </span>
              )}
            </span>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => setViewDay(null)}
                className="ml-auto rounded-lg border-2 border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                Back to day {plan.current_day}
              </button>
            )}
          </div>

          {!ready ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading day {requestedDay}…</p>
          ) : loadFailed ? (
            <p className="py-6 text-center text-sm text-rose-600">
              Couldn’t load day {requestedDay}.{' '}
              <button
                type="button"
                onClick={() => setReloadToken((t) => t + 1)}
                className="font-semibold underline"
              >
                Try again
              </button>
            </p>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-900">{view.label}</p>

              {view.text ? (
                <>
                  <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                    {view.text.content}
                  </div>
                  {/* Displaying this is a licence condition, not decoration. */}
                  <p className="mt-2 text-[10px] leading-snug text-slate-400">
                    {view.text.copyright}
                  </p>
                </>
              ) : (
                <a
                  href={`https://www.bible.com/search/bible?q=${encodeURIComponent(view.label)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Open in Bible app <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {/*
               * Keyed on the day, so the editor remounts when the day changes.
               * A plain useState initialiser runs once and never again, which
               * left the previous day's words sitting over a new passage and
               * filed any save against the wrong day.
               */}
              <ReflectionEditor
                key={`${plan.subscription_id}-${view.day}`}
                initial={view.reflection}
                dayNumber={view.day}
                label={view.label}
                subscriptionId={plan.subscription_id}
                onPost={onPost}
              />
            </>
          )}

          {plan.recentReflections.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Earlier reflections
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {plan.recentReflections.map((r) => (
                  <li key={r.day} className="text-xs text-slate-600">
                    <button
                      type="button"
                      onClick={() => setViewDay(r.day === plan.current_day ? null : r.day)}
                      className="text-left hover:underline"
                    >
                      <span className="font-semibold text-slate-500">
                        Day {r.day}
                        {r.passageLabel ? ` · ${r.passageLabel}` : ''}
                        {r.writtenOn ? ` · ${r.writtenOn}` : ''}:
                      </span>{' '}
                      {r.content.length > 140 ? `${r.content.slice(0, 140)}…` : r.content}
                    </button>
                  </li>
                ))}
              </ul>
              <Link
                href="/spirit/reading/reflections"
                className="mt-2 inline-block text-xs font-medium text-blue-600"
              >
                All reflections →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The reflection box for one day.
 *
 * Its own component so the parent can remount it per day with a key — the
 * value belongs to a specific day and must never survive a day change.
 */
function ReflectionEditor({
  initial,
  dayNumber,
  label,
  subscriptionId,
  onPost,
}: {
  initial: string;
  dayNumber: number;
  label: string;
  subscriptionId: string;
  onPost: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    const ok = await onPost({
      action: 'reflect',
      subscription_id: subscriptionId,
      day_number: dayNumber,
      content: text,
      passage_label: label,
    });
    setSaving(false);
    if (ok) setSaved(true);
  }

  return (
    <div className="mt-4">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <NotebookPen className="h-3.5 w-3.5" />
        Reflection · day {dayNumber}
      </label>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="What stood out? Saved against this day and passage."
        className="mt-1.5 w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-sm focus:border-amber-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !text.trim() || text === initial}
          className="min-h-[40px] rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? 'Saving…' : initial ? 'Update reflection' : 'Save reflection'}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
        {!saved && initial && text === initial && (
          <span className="text-xs text-slate-400">Saved for day {dayNumber}</span>
        )}
      </div>
    </div>
  );
}
