import { supabaseServer } from '@/lib/supabase/server';
import ReadingPlans, { type ActivePlan, type PlanRow } from '@/components/spirit/ReadingPlans';
import { fetchPassage, isBibleTextConfigured, humanReferences } from '@/lib/spirit/bible';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reading Plans | Spirit' };

export default async function ReadingPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: plans }, { data: subs }] = await Promise.all([
    supabase.from('reading_plans').select('id, slug, name, description, day_count').order('day_count'),
    supabase
      .from('reading_plan_subscriptions')
      .select('id, plan_id, started_on')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const allPlans = (plans ?? []) as PlanRow[];
  const sub = subs?.[0];

  let active: ActivePlan | null = null;

  if (sub) {
    const plan = allPlans.find((p) => p.id === sub.plan_id);
    if (plan) {
      const { data: progress } = await supabase
        .from('reading_plan_progress')
        .select('day_number, completed_on')
        .eq('subscription_id', sub.id);

      const done = progress ?? [];
      // Next unread day, rather than a calendar offset — missing a day should
      // not silently skip its reading.
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

      // One request per reference; a day is almost always one or two.
      let text: ActivePlan['text'] = null;
      if (isBibleTextConfigured() && passages.length) {
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
      active = {
        subscription_id: sub.id,
        plan,
        current_day: currentDay,
        completed_days: done.length,
        label,
        passages,
        text,
        doneToday: done.some((d) => d.completed_on === today),
      };
    }
  }

  const available = allPlans.filter((p) => p.id !== sub?.plan_id);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div>
        <h1 className="text-3xl font-semibold">Reading Plans</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isBibleTextConfigured()
            ? 'Today’s passage, in full.'
            : 'References and a link out — add BIBLE_API_KEY to read inline.'}
        </p>
      </div>

      <ReadingPlans active={active} available={available} />
    </div>
  );
}
