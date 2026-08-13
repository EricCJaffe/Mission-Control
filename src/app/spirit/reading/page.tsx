import Link from 'next/link';
import { NotebookPen } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import ReadingPlans, { type ActivePlan, type PlanRow } from '@/components/spirit/ReadingPlans';
import { fetchPassage, isBibleTextConfigured, humanReferences } from '@/lib/spirit/bible';
import { computeProgress } from '@/lib/spirit/reading-progress';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reading Plans | Spirit' };

/**
 * Builds the "where am I" state for one plan run.
 *
 * The current day is the next UNREAD day rather than a date offset — missing a
 * day should not skip its passage.
 */
async function buildActivePlan(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  sub: { id: string; plan_id: string; started_on?: string | null },
  plan: PlanRow,
  withText: boolean
): Promise<ActivePlan | null> {
  const [{ data: progress }, { data: reflections }] = await Promise.all([
    supabase
      .from('reading_plan_progress')
      .select('day_number, completed_on')
      .eq('subscription_id', sub.id),
    supabase
      .from('reading_plan_reflections')
      .select('day_number, content, passage_label, updated_at')
      .eq('subscription_id', sub.id)
      .order('day_number', { ascending: false })
      .limit(5),
  ]);

  const done = progress ?? [];
  const progressState = computeProgress(done, plan.day_count, sub.started_on ?? null);
  const currentDay = progressState.currentDay;

  const { data: dayRow } = await supabase
    .from('reading_plan_days')
    .select('passages, label')
    .eq('plan_id', plan.id)
    .eq('day_number', currentDay)
    .maybeSingle();

  const passages: string[] = dayRow?.passages ?? [];
  const label = dayRow?.label ?? humanReferences(passages);

  let text: ActivePlan['text'] = null;
  if (withText && passages.length) {
    const fetched = await Promise.all(passages.map((p) => fetchPassage(p)));
    const ok = fetched.filter((p): p is NonNullable<typeof p> => p !== null);
    if (ok.length) {
      text = {
        reference: ok.map((p) => p.reference).join('; '),
        content: ok.map((p) => p.content).join('\n\n'),
        copyright: ok[0].copyright,
      };
    }
  }

  const existingReflection = (reflections ?? []).find((r) => r.day_number === currentDay);

  return {
    subscription_id: sub.id,
    plan,
    current_day: currentDay,
    completed_days: done.length,
    label,
    passages,
    text,
    // Was comparing UTC dates against a UTC "today". On Vercel the server runs
    // in UTC, so after 8pm Eastern it had already rolled to tomorrow and the
    // afternoon's reading stopped counting — the same bug the prayer list had.
    doneToday: progressState.doneToday,
    progress: progressState,
    reflection: existingReflection?.content ?? '',
    recentReflections: (reflections ?? [])
      .filter((r) => r.day_number !== currentDay)
      .slice(0, 3)
      .map((r) => ({
        day: r.day_number,
        content: r.content,
        // A reflection is only worth re-reading if you can tell what it was
        // written against and when.
        passageLabel: r.passage_label ?? null,
        writtenOn: r.updated_at ? String(r.updated_at).slice(0, 10) : null,
      })),
  };
}

export default async function ReadingPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: plans }, { data: subs }] = await Promise.all([
    supabase.from('reading_plans').select('id, slug, name, description, day_count').order('day_count'),
    // Every active run, not just the newest. Reading only one made a second
    // started plan look untouched and pushed it back into "choose a plan".
    supabase
      .from('reading_plan_subscriptions')
      .select('id, plan_id, started_on')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ]);

  const allPlans = (plans ?? []) as PlanRow[];
  const subscriptions = subs ?? [];
  const withText = isBibleTextConfigured();

  const active = (
    await Promise.all(
      subscriptions.map(async (sub) => {
        const plan = allPlans.find((p) => p.id === sub.plan_id);
        if (!plan) return null;
        return buildActivePlan(supabase, user.id, sub, plan, withText);
      })
    )
  ).filter((p): p is ActivePlan => p !== null);

  const activePlanIds = new Set(subscriptions.map((s) => s.plan_id));
  const available = allPlans.filter((p) => !activePlanIds.has(p.id));

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Reading Plans</h1>
          <p className="mt-1 text-sm text-slate-500">
            {withText
              ? 'Today’s passage, in full.'
              : 'References and a link out — add BIBLE_API_KEY to read inline.'}
          </p>
        </div>
        <Link
          href="/spirit/reading/reflections"
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <NotebookPen className="h-4 w-4" /> Reflections
        </Link>
      </div>

      <ReadingPlans active={active} available={available} />
    </div>
  );
}
