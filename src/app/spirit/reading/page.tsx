import { supabaseServer } from '@/lib/supabase/server';
import ReadingPlans, { type ActivePlan, type PlanRow } from '@/components/spirit/ReadingPlans';
import { fetchPassage, isBibleTextConfigured, humanReferences } from '@/lib/spirit/bible';

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
  sub: { id: string; plan_id: string },
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
      .select('day_number, content')
      .eq('subscription_id', sub.id)
      .order('day_number', { ascending: false })
      .limit(5),
  ]);

  const done = progress ?? [];
  const doneDays = new Set(done.map((d) => d.day_number));
  let currentDay = 1;
  while (doneDays.has(currentDay) && currentDay <= plan.day_count) currentDay += 1;
  currentDay = Math.min(currentDay, plan.day_count);

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

  const today = new Date().toISOString().slice(0, 10);
  const existingReflection = (reflections ?? []).find((r) => r.day_number === currentDay);

  return {
    subscription_id: sub.id,
    plan,
    current_day: currentDay,
    completed_days: done.length,
    label,
    passages,
    text,
    doneToday: done.some((d) => d.completed_on === today),
    reflection: existingReflection?.content ?? '',
    recentReflections: (reflections ?? [])
      .filter((r) => r.day_number !== currentDay)
      .slice(0, 3)
      .map((r) => ({ day: r.day_number, content: r.content })),
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
      <div>
        <h1 className="text-3xl font-semibold">Reading Plans</h1>
        <p className="mt-1 text-sm text-slate-500">
          {withText
            ? 'Today’s passage, in full.'
            : 'References and a link out — add BIBLE_API_KEY to read inline.'}
        </p>
      </div>

      <ReadingPlans active={active} available={available} />
    </div>
  );
}
