/**
 * PATCH  /api/fitness/running/sessions/:id   `{ feel?: 1-10 | null, notes?: string | null }`
 * DELETE /api/fitness/running/sessions/:id
 *
 * Feel and notes are the two things a watch cannot record, so they are filled
 * in after an upload or sync; the stored points are re-scored with them.
 * Owner-only, like every running table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadActivePlan } from '@/lib/fitness/running-data';
import { pointsFor, requireUser } from '@/lib/fitness/running-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body required' }, { status: 400 });

  const { data: row, error: readError } = await supabase
    .from('running_sessions')
    .select('session_date, distance_mi, duration_s, avg_hr, max_hr, z2_pct, feel, notes')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const next = { feel: row.feel as number | null, notes: row.notes as string | null };
  if ('feel' in body) {
    const feel = body.feel;
    if (feel !== null && !(Number.isInteger(feel) && feel >= 1 && feel <= 10)) {
      return NextResponse.json({ error: 'feel must be an integer 1-10 or null' }, { status: 400 });
    }
    next.feel = feel;
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
    }
    next.notes = body.notes?.trim() ? body.notes.trim().slice(0, 2000) : null;
  }

  const active = await loadActivePlan(supabase, user.id);
  const points = pointsFor(
    { ...row, distance_mi: Number(row.distance_mi), feel: next.feel, notes: next.notes },
    active?.plan.rules,
  );
  const { error } = await supabase
    .from('running_sessions')
    .update({ ...next, points, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, points });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;
  const { data, error } = await supabase
    .from('running_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
