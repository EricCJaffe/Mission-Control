/**
 * POST /api/fitness/running/plan   load (or replace) the running plan
 *
 * Body: `{ plan: RunningPlan, body_md?: string, version?: string }`. Validated,
 * then stored as the signed-in user's active row in mission.running_plans.
 * A previously active plan is archived, not deleted, along with its sessions
 * and coaching notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateRunningPlan } from '@/lib/fitness/running-plan';
import { requireUser } from '@/lib/fitness/running-api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  const body = await req.json().catch(() => null);
  const checked = validateRunningPlan(body?.plan);
  if (!checked.ok) return NextResponse.json({ error: 'Invalid running plan', details: checked.errors }, { status: 400 });
  const plan = checked.plan;

  const { data: archived, error: archiveError } = await supabase
    .from('running_plans')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .select('title');
  if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });

  const { data, error } = await supabase
    .from('running_plans')
    .insert({
      user_id: user.id,
      title: plan.name,
      goal: plan.race.goal ?? null,
      version: typeof body?.version === 'string' ? body.version.slice(0, 40) : null,
      body: plan,
      body_md: typeof body?.body_md === 'string' ? body.body_md.slice(0, 200_000) : null,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id, archived: (archived ?? []).map((p) => p.title) });
}
