import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { CYCLE_LABEL, periodLabel, type CycleKind } from '@/lib/reviews/periods';
import { styleFor, type ReviewStatus } from '@/lib/reviews/status';
import { needsAction, type ReviewReading } from '@/lib/reviews/types';
import CloseCycleClient from '@/components/reviews/CloseCycleClient';
import ReviewWorkClient from '@/components/reviews/ReviewWorkClient';
import { StatusPill } from '@/components/reviews/StatusPill';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/*
 * One cycle, worked top to bottom.
 *
 * Order is the priority matrix — God First, Health, Family, Impact — and not
 * worst-first, deliberately. `src/lib/brief/types.ts` calls that order
 * non-negotiable for the brief, and a review that reorders itself so client
 * work leads whenever client work is worst would teach exactly the habit the
 * matrix exists to break.
 *
 * Within a group, though, the ones needing an answer come first: that is not a
 * reordering of priorities, it is putting the open questions where they will
 * be seen.
 */

const MATRIX_ORDER = ['god_first', 'health', 'family', 'impact', 'admin'] as const;
const MATRIX_LABEL: Record<string, string> = {
  god_first: 'God First',
  health: 'Health',
  family: 'Family',
  impact: 'Impact',
  admin: 'Admin',
};

const RANK: Record<ReviewStatus, number> = { red: 0, yellow: 1, green: 2, unknown: 3, not_due: 4 };

export default async function ReviewCyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect('/login');

  const { data: cycle } = await supabase
    .from('review_cycles')
    .select('id,kind,period_start,period_end,status,overall,summary_md,closed_at,collected_at')
    .eq('id', id)
    .maybeSingle();

  if (!cycle) notFound();

  const { data: readingRows } = await supabase
    .from('review_readings')
    .select('*')
    .eq('cycle_id', id);

  const readings = (readingRows ?? []) as ReviewReading[];
  const closed = cycle.status === 'closed';
  const outstanding = readings.filter(needsAction).length;

  const groups = MATRIX_ORDER.map((key) => ({
    key,
    label: MATRIX_LABEL[key],
    readings: readings
      .filter((r) => r.matrix_key === key)
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.label.localeCompare(b.label)),
  })).filter((g) => g.readings.length > 0);

  const period = {
    kind: cycle.kind as CycleKind,
    start: cycle.period_start,
    end: cycle.period_end,
  };

  return (
    <main className="pt-4 md:pt-8">
      <Link
        href="/reviews"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Reviews
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{CYCLE_LABEL[period.kind]} review</h1>
          <p className="mt-1 text-sm text-slate-500">
            {periodLabel(period)}
            {cycle.collected_at && (
              <span className="text-slate-400">
                {' '}
                · read {new Date(cycle.collected_at).toLocaleString('en-US')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={(cycle.overall ?? 'not_due') as ReviewStatus} size="lg" />
          {!closed && (
            <form action="/reviews/open" method="post">
              <input type="hidden" name="kind" value={period.kind} />
              <button
                type="submit"
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300"
              >
                Re-read the numbers
              </button>
            </form>
          )}
        </div>
      </div>

      {closed && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          This review is closed, so its numbers are frozen. Reopening it lets them be
          re-read against today&rsquo;s data — which will not give the same answer.
        </p>
      )}

      {readings.length === 0 && (
        <p className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing was read for this period. Press &ldquo;Re-read the numbers&rdquo;.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {group.label}
          </h2>
          <div className="mt-2 grid gap-3">
            {group.readings.map((reading) => (
              <ReviewWorkClient key={reading.id} reading={reading} readOnly={closed} />
            ))}
          </div>
        </div>
      ))}

      <CloseCycleClient
        cycleId={cycle.id}
        closed={closed}
        summary={cycle.summary_md}
        outstanding={outstanding}
      />

      {/* The legend, because three colors with no key is a quiz. */}
      <section className="mt-6 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
        {(['green', 'yellow', 'red', 'unknown', 'not_due'] as ReviewStatus[]).map((status) => (
          <div key={status} className="flex items-start gap-2">
            <StatusPill status={status} />
            <span className={styleFor(status).text}>{styleFor(status).meaning}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
