import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import ReflectionJournal, {
  type JournalEntry,
} from '@/components/spirit/ReflectionJournal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reading Reflections | Spirit' };

/**
 * Everything written against a reading plan, in one place.
 *
 * These were only reachable three ways before, all bad: the last three lines of
 * the plan card, a mirrored note in the notes module, or the database. A
 * reflection's whole value is being re-read later next to the passage that
 * prompted it, so it gets its own page — filterable, dated, and linked back to
 * the day it belongs to.
 */
export default async function ReflectionsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: reflections } = await supabase
    .from('reading_plan_reflections')
    .select('id, subscription_id, day_number, passage_label, content, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const subIds = [...new Set((reflections ?? []).map((r) => r.subscription_id))];

  const { data: subs } = subIds.length
    ? await supabase
        .from('reading_plan_subscriptions')
        .select('id, plan_id, started_on, status')
        .in('id', subIds)
    : { data: [] };

  const planIds = [...new Set((subs ?? []).map((s) => s.plan_id))];
  const { data: plans } = planIds.length
    ? await supabase.from('reading_plans').select('id, name').in('id', planIds)
    : { data: [] };

  const planNameBySub = new Map<string, string>();
  for (const sub of subs ?? []) {
    const name = (plans ?? []).find((p) => p.id === sub.plan_id)?.name ?? 'Reading plan';
    // A plan read twice produces two runs; the start date is what tells them
    // apart when the same day number appears in both.
    planNameBySub.set(sub.id, sub.started_on ? `${name} · from ${sub.started_on}` : name);
  }

  const entries: JournalEntry[] = (reflections ?? []).map((r) => ({
    id: r.id,
    subscriptionId: r.subscription_id,
    planLabel: planNameBySub.get(r.subscription_id) ?? 'Reading plan',
    day: r.day_number,
    passageLabel: r.passage_label,
    content: r.content,
    writtenOn: String(r.updated_at ?? r.created_at ?? '').slice(0, 10),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div>
        <Link
          href="/spirit/reading"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ChevronLeft className="h-4 w-4" /> Reading plans
        </Link>
        <h1 className="mt-1 text-3xl font-semibold">Reflections</h1>
        <p className="mt-1 text-sm text-slate-500">
          {entries.length === 0
            ? 'Nothing written yet — reflections you save on a reading day land here.'
            : `${entries.length} reflection${entries.length === 1 ? '' : 's'}, newest first.`}
        </p>
      </div>

      <ReflectionJournal entries={entries} />
    </div>
  );
}
