import { NextRequest, NextResponse } from 'next/server';
import { addDays, today as appToday } from '@/lib/day';
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

    // The app's day, not the server's. Vercel runs in UTC, so this was
    // stamping tomorrow's date on anything read after 8pm Eastern.
    const todayIso = appToday();
    const { error } = await supabase
      .from('reading_plan_progress')
      .upsert(
        { user_id: user.id, subscription_id: subscriptionId, day_number: dayNumber, completed_on: todayIso },
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
        { user_id: user.id, practice_id: practice.id, log_date: todayIso, completed: true },
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

  if (action === 'reflect') {
    const subscriptionId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;
    const dayNumber = Number(body?.day_number);
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    const passageLabel = typeof body?.passage_label === 'string' ? body.passage_label : null;

    if (!subscriptionId || !Number.isInteger(dayNumber) || dayNumber < 1 || !content) {
      return NextResponse.json(
        { error: 'subscription_id, day_number and content are required' },
        { status: 400 }
      );
    }

    const { data: sub } = await supabase
      .from('reading_plan_subscriptions')
      .select('id, plan_id, note_id')
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    const { error: reflectError } = await supabase.from('reading_plan_reflections').upsert(
      {
        user_id: user.id,
        subscription_id: subscriptionId,
        day_number: dayNumber,
        passage_label: passageLabel,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'subscription_id,day_number' }
    );
    if (reflectError) {
      return NextResponse.json({ error: reflectError.message }, { status: 500 });
    }

    // Mirror every reflection for this run into one note, so they're readable
    // from the notes side and comparable when the plan is read again later.
    const { data: plan } = await supabase
      .from('reading_plans')
      .select('name')
      .eq('id', sub.plan_id)
      .maybeSingle();

    const { data: allReflections } = await supabase
      .from('reading_plan_reflections')
      .select('day_number, passage_label, content, created_at, updated_at')
      .eq('subscription_id', subscriptionId)
      .order('day_number');

    const title = `Reading: ${plan?.name ?? 'Bible plan'}`;
    const markdown = [
      `# ${title}`,
      '',
      ...(allReflections ?? []).flatMap((r) => {
        // Day, passage and date on the heading — a reflection read months
        // later is only useful if it says what it was written against.
        const writtenOn = String(r.updated_at ?? r.created_at ?? '').slice(0, 10);
        return [
          `## Day ${r.day_number}${r.passage_label ? ` — ${r.passage_label}` : ''}`,
          '',
          ...(writtenOn ? [`*${writtenOn}*`, ''] : []),
          r.content,
          '',
        ];
      }),
    ].join('\n');

    let noteId = sub.note_id as string | null;
    if (noteId) {
      await supabase
        .from('notes')
        .update({ content_md: markdown, updated_at: new Date().toISOString() })
        .eq('id', noteId)
        .eq('user_id', user.id);
    } else {
      const { data: note } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title,
          content_md: markdown,
          tags: ['bible-reading', 'spirit'],
        })
        .select('id')
        .single();
      noteId = note?.id ?? null;
      if (noteId) {
        await supabase
          .from('reading_plan_subscriptions')
          .update({ note_id: noteId })
          .eq('id', subscriptionId);
      }
    }

    return NextResponse.json({ ok: true, day_number: dayNumber, note_id: noteId });
  }

  /*
   * Catch me up — YouVersion's semantics, and the right ones.
   *
   * Moving the subscription's start date forward makes the plan's "expected
   * day" line up with the next unread day, so the backlog clears without
   * marking a single skipped passage as read. The record stays honest about
   * what was actually read; only the pace expectation moves.
   *
   * The alternative — bulk-inserting completions for the missed days — would
   * make the history claim readings that never happened, which is worse than
   * being behind.
   */
  if (action === 'catch_up') {
    const subscriptionId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscription_id required' }, { status: 400 });
    }

    const { data: sub } = await supabase
      .from('reading_plan_subscriptions')
      .select('id, started_on')
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    const { data: progress } = await supabase
      .from('reading_plan_progress')
      .select('day_number')
      .eq('subscription_id', subscriptionId);

    const doneDays = new Set((progress ?? []).map((p) => p.day_number));
    let nextUnread = 1;
    while (doneDays.has(nextUnread)) nextUnread += 1;

    // Re-anchor so that today IS the next unread day.
    const newStart = addDays(appToday(), -(nextUnread - 1));

    const { error } = await supabase
      .from('reading_plan_subscriptions')
      .update({ started_on: newStart, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, current_day: nextUnread, started_on: newStart });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
