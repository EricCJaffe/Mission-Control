/**
 * POST /api/fitness/running/sync-apple
 *
 * Copies runs that arrived through the Apple Health feed (workout_logs rows
 * with an apple_workout_id) inside the active plan's window into the running
 * session log, source `apple_health`, dedupe key `apple:<workout_log id>`.
 * A run already in the log from an upload or by hand (same day, distance and
 * time) is left alone. Read-only against workout_logs.
 */

import { NextResponse } from 'next/server';
import { dayOf } from '@/lib/day';
import { isRunLike, paceLabel, sameActivity } from '@/lib/fitness/activity-files';
import { loadActivePlan } from '@/lib/fitness/running-data';
import { pointsFor, requireUser, type SessionInput } from '@/lib/fitness/running-api';

export const dynamic = 'force-dynamic';

type Cardio = { activity_type: string | null; distance_miles: number | null };

export async function POST() {
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  const active = await loadActivePlan(supabase, user.id);
  if (!active) return NextResponse.json({ error: 'Load a running plan first' }, { status: 409 });
  const { plan } = active;

  const [{ data: logs, error: logsError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('id, workout_date, duration_minutes, avg_hr, max_hr, cardio_logs(activity_type, distance_miles)')
      .eq('user_id', user.id)
      .not('apple_workout_id', 'is', null)
      .gte('workout_date', `${plan.start_date}T00:00:00-05:00`)
      .lte('workout_date', `${plan.race.date}T23:59:59-04:00`),
    supabase
      .from('running_sessions')
      .select('session_date, distance_mi, duration_s, dedupe_key')
      .eq('user_id', user.id)
      .gte('session_date', plan.start_date)
      .lte('session_date', plan.race.date),
  ]);
  if (logsError || sessionsError) {
    return NextResponse.json({ error: (logsError ?? sessionsError)?.message }, { status: 500 });
  }

  const keys = new Set((sessions ?? []).map((s) => s.dedupe_key));
  const existing = (sessions ?? []).map((s) => ({ date: s.session_date, distanceMi: Number(s.distance_mi), durationSec: s.duration_s }));
  let added = 0;
  let matched = 0;

  for (const log of logs ?? []) {
    const cardio = (Array.isArray(log.cardio_logs) ? log.cardio_logs[0] : log.cardio_logs) as Cardio | null;
    const distance = Number(cardio?.distance_miles ?? 0);
    if (!cardio || !isRunLike(cardio.activity_type) || !(distance > 0)) continue;
    const key = `apple:${log.id}`;
    if (keys.has(key)) continue;
    const date = dayOf(log.workout_date);
    const durationSec = log.duration_minutes != null ? log.duration_minutes * 60 : null;
    if (existing.some((e) => sameActivity({ date, distanceMi: distance, durationSec: durationSec ?? -1e9 }, e))) {
      matched += 1;
      continue;
    }
    const row: SessionInput = {
      session_date: date,
      started_at: log.workout_date,
      distance_mi: Math.round(distance * 100) / 100,
      duration_s: durationSec,
      pace: durationSec ? paceLabel(durationSec, distance) : null,
      avg_hr: log.avg_hr,
      max_hr: log.max_hr,
    };
    const { error } = await supabase.from('running_sessions').insert({
      ...row,
      user_id: user.id,
      plan_id: active.id,
      points: pointsFor(row, plan.rules),
      source: 'apple_health',
      dedupe_key: key,
    });
    if (error && error.code !== '23505') return NextResponse.json({ error: error.message, added }, { status: 500 });
    if (!error) {
      added += 1;
      existing.push({ date, distanceMi: distance, durationSec });
    }
  }
  return NextResponse.json({ added, alreadyLogged: matched });
}
