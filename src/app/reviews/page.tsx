import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';

import { today as appToday } from '@/lib/day';
import { periodLabel, periodToReview, type CycleKind } from '@/lib/reviews/periods';
import { formatValue, styleFor, unitLabelFor, type ReviewStatus } from '@/lib/reviews/status';
import { needsAction, type ProjectLine, type ReviewReading } from '@/lib/reviews/types';
import { StatusChip, StatusPill } from '@/components/reviews/StatusPill';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/*
 * The review dashboard.
 *
 * WHAT KILLED THE LAST ONE, AND WHAT IS DIFFERENT HERE
 *
 * `mission.monthly_reviews` holds zero rows. It was retired on 2026-08-03
 * having never been completed once, and the reason is visible in its shape: it
 * was a blank form. It asked Eric to recall the month, score it and decide what
 * to do, and the first of those three is work a person will always postpone.
 *
 * So this page never starts blank. Every number on it is already computed from
 * the practice log, the training log, the task board and the project board
 * before he arrives. What is asked of him is the last part only — one line on
 * anything that is not green — and it is asked one area at a time.
 *
 * RED MEANS NO READING. See `src/lib/reviews/status.ts`; this is Eric's rule
 * and it deliberately contradicts the grey that `status-colors.ts` uses for a
 * missing pillar score.
 */

const MATRIX_ORDER = ['god_first', 'health', 'family', 'impact', 'admin'] as const;
const MATRIX_LABEL: Record<string, string> = {
  god_first: 'God First',
  health: 'Health',
  family: 'Family',
  impact: 'Impact',
  admin: 'Admin',
};

function OpenCycleForm({ kind, label }: { kind: CycleKind; label: string }) {
  return (
    <form action="/reviews/open" method="post">
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
      >
        {label}
      </button>
    </form>
  );
}

function ReadingTile({ reading, cycleId }: { reading: ReviewReading; cycleId: string }) {
  const style = styleFor(reading.status);
  const unit = unitLabelFor(reading.unit);

  return (
    <Link
      href={`/reviews/${cycleId}#${reading.area_key}`}
      className={`block rounded-2xl border-2 bg-white p-4 shadow-sm transition hover:shadow-md ${style.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {reading.label}
        </div>
        <StatusPill status={reading.status} carried={reading.carried_cycles} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold">
          {reading.has_reading && reading.value !== null
            ? formatValue(Number(reading.value))
            : '—'}
        </span>
        {unit && reading.has_reading && (
          <span className="text-sm text-slate-400">{unit}</span>
        )}
        {reading.green_at !== null && (
          <span className="ml-auto text-xs text-slate-400">
            line {formatValue(Number(reading.green_at))}
            {unit}
          </span>
        )}
      </div>

      <p className={`mt-2 text-xs ${style.text}`}>{reading.status_reason}</p>

      {reading.action_md ? (
        <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-600">
          {reading.action_md}
        </p>
      ) : needsAction(reading) ? (
        <p className="mt-2 text-xs font-medium text-slate-500">
          Needs one line — what would fix it?
        </p>
      ) : null}
    </Link>
  );
}

export default async function ReviewsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/login');

  const period = periodToReview('weekly', appToday());

  const { data: cycles } = await supabase
    .from('review_cycles')
    .select('id,kind,period_start,period_end,status,overall,summary_md,closed_at,collected_at')
    .eq('kind', 'weekly')
    .order('period_start', { ascending: false })
    .limit(12);

  const history = cycles ?? [];
  const current = history.find((c: { period_start: string }) => c.period_start === period.start);

  const { data: readingRows } = current
    ? await supabase
        .from('review_readings')
        .select('*')
        .eq('cycle_id', current.id)
        .order('matrix_key')
    : { data: null };

  const readings = (readingRows ?? []) as ReviewReading[];
  const byMatrix = MATRIX_ORDER.map((key) => ({
    key,
    label: MATRIX_LABEL[key],
    readings: readings.filter((r) => r.matrix_key === key),
  })).filter((group) => group.readings.length > 0);

  const projectReading = readings.find((r) => r.area_key === 'project_health');
  const projectLines = ((projectReading?.detail as { projects?: ProjectLine[] })?.projects ??
    []) as ProjectLine[];

  const open = readings.filter(needsAction);

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <ClipboardCheck size={28} className="text-blue-600" />
            Reviews
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {periodLabel(period)} — red means past the line, <em>or nothing logged</em>.
          </p>
        </div>
        <div className="flex gap-2">
          <OpenCycleForm kind="weekly" label={current ? 'Recompute week' : 'Open this week'} />
          <OpenCycleForm kind="monthly" label="Open month" />
          <OpenCycleForm kind="quarterly" label="Open quarter" />
        </div>
      </div>

      {/* The trend strip. Twelve weeks at a glance is the only thing on this
          page that cannot be got from looking at this week alone. */}
      {history.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Last {history.length} weeks
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {history
              .slice()
              .reverse()
              .map((c: { id: string; overall: ReviewStatus | null; period_start: string; period_end: string }) => (
                <StatusChip
                  key={c.id}
                  status={c.overall}
                  label={periodLabel({ kind: 'weekly', start: c.period_start, end: c.period_end })}
                  href={`/reviews/${c.id}`}
                />
              ))}
          </div>
        </section>
      )}

      {!current && (
        <section className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            No review open for {periodLabel(period)}.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs text-slate-500">
            Opening one reads the practice log, the training log, the task board and every
            active project, and scores them against their lines. Nothing to fill in first.
          </p>
          <div className="mt-4 flex justify-center">
            <OpenCycleForm kind="weekly" label="Open this week" />
          </div>
        </section>
      )}

      {current && (
        <>
          <section className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <StatusPill status={(current.overall ?? 'not_due') as ReviewStatus} size="lg" />
            <div className="text-sm text-slate-600">
              {open.length === 0
                ? 'Every area that needs a line has one.'
                : `${open.length} area${open.length === 1 ? '' : 's'} still need a line from you.`}
            </div>
            <Link
              href={`/reviews/${current.id}`}
              className="ml-auto rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              {current.status === 'closed' ? 'Read the review' : 'Work the review'}
            </Link>
          </section>

          {byMatrix.map((group) => (
            <section key={group.key} className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </h2>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.readings.map((reading) => (
                  <ReadingTile key={reading.id} reading={reading} cycleId={current.id} />
                ))}
              </div>
            </section>
          ))}

          {projectLines.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Projects — worst first
              </h2>
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Project</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Why</th>
                      <th className="px-4 py-2 text-right">Open</th>
                      <th className="px-4 py-2 text-right">Late</th>
                      <th className="px-4 py-2 text-right">Idle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectLines.map((line) => (
                      <tr key={line.id} className={styleFor(line.status).bg}>
                        <td className="px-4 py-2 font-medium">
                          {line.title}
                          {line.client && (
                            <span className="ml-2 text-xs text-slate-500">{line.client}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill status={line.status} />
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">{line.reason}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{line.openTasks}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {line.overdueTasks || '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                          {line.daysSinceTouch === null ? '—' : `${line.daysSinceTouch}d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
