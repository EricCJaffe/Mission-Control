'use client';

import { useState, useTransition } from 'react';
import { Check, Flame } from 'lucide-react';
import {
  summarisePractices,
  type Practice,
  type PracticeLog,
} from '@/lib/spirit/practices';
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

/**
 * Daily check-off for spiritual practices.
 *
 * Optimistic on tap: at the gym or first thing in the morning, waiting on a
 * round-trip before the tick appears makes the whole thing feel broken. The
 * local state is rolled back if the write fails.
 */
export default function PracticeTracker({ practices, logs: initialLogs, today }: Props) {
  const [logs, setLogs] = useState<PracticeLog[]>(initialLogs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const summaries = summarisePractices(practices, logs, { today });

  async function toggle(practice: Practice, done: boolean) {
    const next = done
      ? [...logs.filter((l) => !(l.practice_id === practice.id && l.log_date === today)),
         { practice_id: practice.id, log_date: today, completed: true }]
      : logs.filter((l) => !(l.practice_id === practice.id && l.log_date === today));

    const previous = logs;
    setLogs(next);
    setError(null);

    try {
      const res = await fetch('/api/spirit/practices/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practice_id: practice.id, log_date: today, completed: done }),
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
      {summaries.map(({ practice, adherence, standing }) => {
        const done = adherence.doneThisPeriod;
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
              aria-label={`${practice.label} ${CADENCE_LABEL[practice.cadence] ?? ''}`}
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

            {/* Label alongside the colour — hue alone can't carry the status. */}
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
