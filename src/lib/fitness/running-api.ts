/**
 * Shared helpers for the /api/fitness/running routes: the signed-in user, and
 * the running_sessions row shape with its points scored at write time.
 */

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { RunningPlan } from './running-plan';
import { scoreSession } from './running-score';

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { supabase, user: data.user, denied: null };
}

export interface SessionInput {
  session_date: string;
  started_at?: string | null;
  distance_mi: number;
  duration_s: number | null;
  pace?: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  z2_pct?: number | null;
  longest_continuous_min?: number | null;
  gain_ft?: number | null;
  kcal?: number | null;
  feel?: number | null;
  notes?: string | null;
}

/** Points as the plan scores them, stored with the row for the record. */
export function pointsFor(s: SessionInput, rules: RunningPlan['rules'] | undefined): number {
  return scoreSession(
    {
      date: s.session_date,
      distanceMi: s.distance_mi,
      durationSec: s.duration_s,
      avgHr: s.avg_hr,
      maxHr: s.max_hr,
      z2Pct: s.z2_pct ?? null,
      feel: s.feel ?? null,
      notes: s.notes ?? null,
    },
    rules ?? {},
  ).points;
}
