/**
 * POST /api/fitness/running/sessions   log a run by hand
 *
 * Body: `{ date, distance_mi, duration ("mm:ss" or "h:mm:ss"), avg_hr?, max_hr?,
 * feel?, notes?, longest_continuous_min? }`. For runs with no file and no
 * Apple Health row. Written to running_sessions with source `manual`.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { paceLabel, parseDuration } from '@/lib/fitness/activity-files';
import { loadActivePlan } from '@/lib/fitness/running-data';
import { pointsFor, requireUser, type SessionInput } from '@/lib/fitness/running-api';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function hr(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 30 && n <= 240 ? n : NaN;
}

export async function POST(req: NextRequest) {
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'JSON body required' }, { status: 400 });

  const errors: string[] = [];
  if (!ISO.test(b.date ?? '')) errors.push('date must be YYYY-MM-DD');
  const distance = Number(b.distance_mi);
  if (!(distance > 0 && distance < 100)) errors.push('distance_mi must be between 0 and 100');
  const duration = b.duration ? parseDuration(String(b.duration)) : 0;
  if (b.duration && !duration) errors.push('duration must be mm:ss or h:mm:ss');
  const avg = hr(b.avg_hr);
  const max = hr(b.max_hr);
  if (Number.isNaN(avg) || Number.isNaN(max)) errors.push('heart rates must be whole numbers 30-240');
  const feel = b.feel === null || b.feel === undefined || b.feel === '' ? null : Number(b.feel);
  if (feel !== null && !(Number.isInteger(feel) && feel >= 1 && feel <= 10)) errors.push('feel must be 1-10');
  const longest = b.longest_continuous_min === undefined || b.longest_continuous_min === '' || b.longest_continuous_min === null
    ? null
    : Number(b.longest_continuous_min);
  if (longest !== null && !(longest >= 0 && longest < 1000)) errors.push('longest_continuous_min must be minutes');
  if (errors.length) return NextResponse.json({ error: 'Invalid run', details: errors }, { status: 400 });

  const active = await loadActivePlan(supabase, user.id);
  const row: SessionInput = {
    session_date: b.date,
    distance_mi: Math.round(distance * 100) / 100,
    duration_s: duration || null,
    pace: duration ? paceLabel(duration, distance) : null,
    avg_hr: avg,
    max_hr: max,
    longest_continuous_min: longest,
    feel,
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : null,
  };
  const { data, error } = await supabase
    .from('running_sessions')
    .insert({
      ...row,
      user_id: user.id,
      plan_id: active?.id ?? null,
      points: pointsFor(row, active?.plan.rules),
      source: 'manual',
      dedupe_key: `manual:${randomUUID()}`,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
