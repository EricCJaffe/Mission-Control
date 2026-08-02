import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Reading-plan actions: start a plan, or mark a day read.
 *
 * Completing a day also ticks the `bible_reading` practice for that date, so
 * the practice score reflects reading done through a plan without asking for
 * the same check-off twice.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === 'subscribe') {
    const planId = typeof body?.plan_id === 'string' ? body.plan_id : null;
    if (!planId) return NextResponse.json({ error: 'plan_id required' }, { status: 400 });

    const { data, error } = await supabase
      .from('reading_plan_subscriptions')
      .insert({ user_id: user.id, plan_id: planId })
      .select('id')
      .single();

    // A partial unique index allows only one active run per plan.
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'That plan is already active.' }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, subscription_id: data.id });
  }

  if (action === 'complete') {
    const subscriptionId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;
    const dayNumber = Number(body?.day_number);
    if (!subscriptionId || !Number.isInteger(dayNumber) || dayNumber < 1) {
      return NextResponse.json({ error: 'subscription_id and day_number required' }, { status: 400 });
    }

    const { data: sub } = await supabase
      .from('reading_plan_subscriptions')
      .select('id, plan_id')
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('reading_plan_progress')
      .upsert(
        { user_id: user.id, subscription_id: subscriptionId, day_number: dayNumber, completed_on: today },
        { onConflict: 'subscription_id,day_number' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Reading through a plan IS the Bible-reading practice — don't make him
    // record it twice.
    const { data: practice } = await supabase
      .from('practices')
      .select('id')
      .eq('user_id', user.id)
      .eq('key', 'bible_reading')
      .maybeSingle();
    if (practice) {
      await supabase.from('practice_logs').upsert(
        { user_id: user.id, practice_id: practice.id, log_date: today, completed: true },
        { onConflict: 'user_id,practice_id,log_date' }
      );
    }

    // Close the plan out once the final day is done.
    const { count: doneCount } = await supabase
      .from('reading_plan_progress')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_id', subscriptionId);
    const { data: plan } = await supabase
      .from('reading_plans')
      .select('day_count')
      .eq('id', sub.plan_id)
      .maybeSingle();
    if (plan && doneCount !== null && doneCount >= plan.day_count) {
      await supabase
        .from('reading_plan_subscriptions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', subscriptionId);
    }

    return NextResponse.json({ ok: true, day_number: dayNumber, completed_days: doneCount });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
