import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** Mirrors the training_plans_discipline_check constraint. */
const DISCIPLINES = ['strength', 'cardio', 'martial_arts', 'mobility', 'general'];

/**
 * Falls back to reading the discipline out of the plan type and name.
 *
 * Callers that predate concurrent plans do not send one, and defaulting them
 * all to 'general' would make two such plans collide with each other — the
 * opposite of what the per-discipline constraint is for.
 */
function inferDiscipline(planType?: string, name?: string): string {
  const hay = `${planType ?? ''} ${name ?? ''}`.toLowerCase();
  if (/run|cardio|endurance|5k|10k|marathon|cycl|bike|swim|row/.test(hay)) return 'cardio';
  if (/jiu.?jitsu|bjj|grappl|wrestl|judo|muay thai|boxing|mma|karate/.test(hay)) return 'martial_arts';
  if (/mobility|yoga|stretch|flexib/.test(hay)) return 'mobility';
  if (/strength|lift|hypertrophy|push|pull|power/.test(hay)) return 'strength';
  return 'general';
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, start_date, end_date, cycle_weeks, plan_type, discipline, notes } = body;

  if (!name || !start_date || !end_date) {
    return NextResponse.json({ error: 'name, start_date, and end_date are required' }, { status: 400 });
  }

  const resolvedDiscipline = DISCIPLINES.includes(discipline)
    ? discipline
    : inferDiscipline(plan_type, name);

  const { data, error } = await supabase
    .from('training_plans')
    .insert({
      user_id: user.id,
      name,
      start_date,
      end_date,
      cycle_weeks: cycle_weeks || 4,
      plan_type: plan_type || 'strength',
      discipline: resolvedDiscipline,
      status: 'active',
      config: { notes: notes || null },
    })
    .select()
    .single();

  // One active plan per discipline is a database constraint, so the collision
  // arrives here as a unique violation. Left raw it reads as an index name,
  // which tells you nothing about what to do; the plan you already have is the
  // useful part of the answer.
  if (error?.code === '23505') {
    const { data: clash } = await supabase
      .from('training_plans')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('discipline', resolvedDiscipline)
      .eq('status', 'active')
      .maybeSingle();
    return NextResponse.json(
      {
        error: clash
          ? `You already have an active ${resolvedDiscipline} plan: "${clash.name}". Finish or archive it first, or create this one as a draft.`
          : `You already have an active ${resolvedDiscipline} plan.`,
        conflict: { discipline: resolvedDiscipline, plan_id: clash?.id ?? null },
      },
      { status: 409 }
    );
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('training_plans')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plan: data });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Delete planned workouts first
  await supabase.from('planned_workouts').delete().eq('plan_id', id).eq('user_id', user.id);

  const { error } = await supabase
    .from('training_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
