import { NextRequest, NextResponse } from 'next/server';
import { fetchPassage, humanReferences, isBibleTextConfigured } from '@/lib/spirit/bible';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * One day of a plan run — passage, text and the reflection written against it.
 *
 * The page renders the current day server-side; this is what lets the card walk
 * back to an earlier day without a navigation. Reading yesterday's passage
 * again, or re-reading what you wrote about it, is a normal thing to want and
 * was previously impossible without digging through the notes module.
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscriptionId = req.nextUrl.searchParams.get('subscription_id');
  const dayNumber = Number(req.nextUrl.searchParams.get('day'));
  if (!subscriptionId || !Number.isInteger(dayNumber) || dayNumber < 1) {
    return NextResponse.json({ error: 'subscription_id and day required' }, { status: 400 });
  }

  const { data: sub } = await supabase
    .from('reading_plan_subscriptions')
    .select('id, plan_id')
    .eq('id', subscriptionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  const [{ data: dayRow }, { data: reflection }, { data: progress }] = await Promise.all([
    supabase
      .from('reading_plan_days')
      .select('passages, label')
      .eq('plan_id', sub.plan_id)
      .eq('day_number', dayNumber)
      .maybeSingle(),
    supabase
      .from('reading_plan_reflections')
      .select('content')
      .eq('subscription_id', subscriptionId)
      .eq('day_number', dayNumber)
      .maybeSingle(),
    supabase
      .from('reading_plan_progress')
      .select('completed_on')
      .eq('subscription_id', subscriptionId)
      .eq('day_number', dayNumber)
      .maybeSingle(),
  ]);

  const passages: string[] = dayRow?.passages ?? [];
  const label = dayRow?.label ?? humanReferences(passages);

  let text: { reference: string; content: string; copyright: string } | null = null;
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

  return NextResponse.json({
    day: dayNumber,
    label,
    passages,
    text,
    reflection: reflection?.content ?? '',
    completedOn: progress?.completed_on ?? null,
  });
}
