'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Flame } from 'lucide-react';
import {
  summarisePractices,
  type Practice,
  type PracticeLog,
} from '@/lib/spirit/practices';
import { addDays } from '@/lib/day';
import { STATUS_STYLES, statusForScore } from '@/lib/status-colors';

type Props = {
  practices: Practice[];
  logs: PracticeLog[];
  today: string;
};

const CADENCE_LABEL: Record<string, string> = {
  daily: 'today',
  weekly: 'this week',
  monthly: 'this month',
};

/** How many days back the strip offers. A week is as far as memory is honest. */
const BACKFILL_DAYS = 7;

/**
 * Daily check-off for spiritual practices.
 *
 * Optimistic on tap: at the gym or first thing in the morning, waiting on a
 * round-trip before the tick appears makes the whole thing feel broken. The
 * local state is rolled back if the write fails.
 *
 * YESTERDAY IS TICKABLE, AND THAT IS THE POINT OF THE DAY STRIP.
 *
 * Eric, 2026-09-20: "I have been reading some I just have to get better at
 * logging it." The API has always accepted any `log_date` — its own comment
 * says "back-dating yesterday's reading updates that day" — but this component
 * only ever sent today, so there was no way to record a day you missed. The
 * reading happened; only the record of it was impossible. That gap matters
 * more now than it did, because the review module scores an unlogged day as
 * RED, so a logging failure and a spiritual failure would look identical.
 *
 * Seven days and no further. Beyond a week it stops being a record and starts
 * being a reconstruction, and a practice log nobody believes is worse than a
 * short one.
 */
export default function PracticeTracker({ practices, logs: initialLogs, today }: Props) {
  const [logs, setLogs] = useState<PracticeLog[]>(initialLogs);
  const [day, setDay] = useState(today);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Adherence is always computed as at TODAY, never as at the selected day.
  // Scrolling back to Tuesday must not make the streak read as it did on
  // Tuesday — the numbers describe now, the tick describes the day you picked.
  const summaries = summarisePractices(practices, logs, { today });

  const days = useMemo(
    () => Array.from({ length: BACKFILL_DAYS }, (_, i) => addDays(today, -(BACKFILL_DAYS - 1 - i))),
    [today]
  );

  const backdating = day !== today;

  /** Is this practice ticked on the selected day specifically? */
  function tickedOn(practice: Practice, iso: string): boolean {
    return logs.some((l) => l.practice_id === practice.id && l.log_date === iso && l.completed);
  }

  async function toggle(practice: Practice, done: boolean) {
    const next = done
      ? [...logs.filter((l) => !(l.practice_id === practice.id && l.log_date === day)),
         { practice_id: practice.id, log_date: day, completed: true }]
      : logs.filter((l) => !(l.practice_id === practice.id && l.log_date === day));

    const previous = logs;
    setLogs(next);
    setError(null);

    try {
      const res = await fetch('/api/spirit/practices/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_id: practice.id, log_date: day, completed: done }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not save');
      startTransition(() => {});
    } catch (err) {
      setLogs(previous); // roll back so the tick never lies
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <div className="space-y-2">
      {/* The day strip. Today is the default and stays highlighted; the rest
          exist so a reading that happened can still be recorded. */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {days.map((iso) => {
          const isToday = iso === today;
          const selected = iso === day;
          const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
            weekday: 'short',
            timeZone: 'UTC',
          });
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDay(iso)}
              aria-pressed={selected}
              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border-2 text-[11px] font-semibold transition-colors ${
                selected
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
              }`}
            >
              <span>{isToday ? 'Today' : label}</span>
              <span className={selected ? 'text-white/80' : 'text-slate-400'}>
                {iso.slice(8)}
              </span>
            </button>
          );
        })}
      </div>

      {backdating && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Recording for{' '}
          {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}
          . The scores below still read as at today.
        </p>
      )}

      {summaries.map(({ practice, adherence, standing }) => {
        // On today, "done" means the period is satisfied, which is what makes
        // a weekly practice read correctly. On any earlier day it means that
        // day specifically — otherwise every day of a satisfied week would
        // show a tick and back-dating would be impossible to see.
        const done = backdating ? tickedOn(practice, day) : adherence.doneThisPeriod;
        const style = standing ? STATUS_STYLES[standing] : STATUS_STYLES.unknown;
        return (
          <div
            key={practice.id}
            className={`flex items-center gap-3 rounded-2xl border-2 bg-white p-3 shadow-sm transition-colors ${
              done ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-300'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(practice, !done)}
              disabled={pending}
              aria-pressed={done}
              aria-label={`${practice.label} ${backdating ? day : (CADENCE_LABEL[practice.cadence] ?? '')}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors ${
                done
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-300 hover:border-emerald-400'
              }`}
            >
              <Check className="h-5 w-5" strokeWidth={3} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{practice.label}</p>
              <p className="text-xs text-slate-500">
                {adherence.rate === null ? (
                  'No history yet'
                ) : (
                  <>
                    {adherence.met}/{adherence.periods}{' '}
                    {practice.cadence === 'daily' ? 'days' : practice.cadence === 'weekly' ? 'weeks' : 'months'}
                  </>
                )}
                {adherence.streak > 1 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 font-medium text-orange-600">
                    <Flame className="h-3 w-3" />
                    {adherence.streak}
                  </span>
                )}
              </p>
            </div>

            {/* Label alongside the color — hue alone can't carry the status. */}
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}
            >
              {adherence.score === null ? 'New' : style.label}
            </span>
          </div>
        );
      })}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}
    </div>
  );
}

/** Compact pillar readout: the felt score next to the lived one. */
export function SpiritScorePanel({
  surveyScore,
  practiceScore,
  gapReading,
}: {
  surveyScore: number | null;
  practiceScore: number | null;
  gapReading: 'aligned' | 'feeling_ahead' | 'doing_ahead' | 'unknown';
}) {
  const surveyStyle = statusForScore(surveyScore);
  const practiceStyle = statusForScore(practiceScore);

  const gapCopy: Record<typeof gapReading, string> = {
    aligned: 'How it feels and what you do are telling the same story.',
    feeling_ahead:
      'You rate your spiritual life higher than your practice log shows. Worth a look at which is closer to the truth.',
    doing_ahead:
      'You are practising more consistently than you feel. The habits are there even if the sense of it lags.',
    unknown: 'Take the assessment and log a few practices to compare the two.',
  };

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Spirit</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className={`rounded-xl border-2 p-3 ${surveyStyle.border} ${surveyStyle.bg}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">How it feels</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${surveyStyle.text}`}>
            {surveyScore ?? '—'}
          </p>
          <p className="text-[11px] text-slate-500">survey · {surveyStyle.label}</p>
        </div>
        <div className={`rounded-xl border-2 p-3 ${practiceStyle.border} ${practiceStyle.bg}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What you did</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${practiceStyle.text}`}>
            {practiceScore ?? '—'}
          </p>
          <p className="text-[11px] text-slate-500">practices · {practiceStyle.label}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{gapCopy[gapReading]}</p>
    </div>
  );
}
