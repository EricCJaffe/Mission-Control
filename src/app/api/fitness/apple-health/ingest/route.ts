import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import {
  normalizeApplePayload,
  type HaePayload,
  type NormalizedAppleHealth,
} from '@/lib/fitness/apple-health-import';

/**
 * Ingest endpoint for Health Auto Export running on the phone.
 *
 * This is the one route in the app that is not cookie-authenticated: the
 * phone posts in the background with no browser session. It is guarded by a
 * bearer token and writes with the service role, so it is deliberately
 * fail-CLOSED — if either env var is missing the route refuses every request
 * rather than silently accepting them.
 *
 * Setup:
 *   APPLE_HEALTH_INGEST_TOKEN  long random string, also set in the HAE app
 *   APPLE_HEALTH_USER_ID       the Supabase auth user id rows are written for
 */

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SOURCE = 'Apple Health';

/**
 * Cap on what we keep in apple_health_sync_logs.raw_payload. Routine hourly
 * syncs are small and stored whole, which is what makes an unmapped metric
 * diagnosable. A full backfill is ~10MB and would bloat the table for no
 * extra insight, so those are recorded as a summary instead.
 */
const MAX_RAW_PAYLOAD_BYTES = 512 * 1024;

function rawPayloadForLog(payload: HaePayload): unknown {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(payload));
  } catch {
    return { note: 'payload could not be serialised for logging' };
  }
  if (size <= MAX_RAW_PAYLOAD_BYTES) return payload;
  return {
    note: 'payload too large to store in full',
    bytes: size,
    metric_count: payload?.data?.metrics?.length ?? 0,
    workout_count: payload?.data?.workouts?.length ?? 0,
  };
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.APPLE_HEALTH_INGEST_TOKEN;
  const userId = process.env.APPLE_HEALTH_USER_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!expectedToken || !userId || !supabaseUrl || !serviceKey) {
    // Never fall through to "no auth required" when configuration is absent.
    return NextResponse.json(
      { error: 'Apple Health ingest is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !tokenMatches(provided, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: HaePayload;
  try {
    payload = (await req.json()) as HaePayload;
  } catch {
    return NextResponse.json({ error: 'Body was not valid JSON' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const automationName = req.headers.get('automation-name');
  const sessionId = req.headers.get('session-id');

  let normalized: NormalizedAppleHealth;
  try {
    normalized = normalizeApplePayload(payload);
  } catch (err) {
    await supabase.from('apple_health_sync_logs').insert({
      user_id: userId,
      status: 'failed',
      automation_name: automationName,
      session_id: sessionId,
      error_message: err instanceof Error ? err.message : 'Failed to parse payload',
      raw_payload: rawPayloadForLog(payload),
    });
    return NextResponse.json({ error: 'Could not parse payload' }, { status: 400 });
  }

  const counts = {
    body: 0,
    daily: 0,
    sleep: 0,
    bp: 0,
    workouts: 0,
    workoutsSkipped: 0,
    running: 0,
    mobility: 0,
    routes: 0,
  };
  const errors: string[] = [];

  // ——— body_metrics ———
  if (normalized.bodyMetrics.length) {
    const rows = normalized.bodyMetrics.map((m) => ({
      user_id: userId,
      ...m,
      ...(m.weight_lbs !== undefined ? { weight_source: SOURCE } : {}),
    }));
    const { error } = await supabase
      .from('body_metrics')
      .upsert(rows, { onConflict: 'user_id,metric_date' });
    if (error) errors.push(`body_metrics: ${error.message}`);
    else counts.body = rows.length;
  }

  // ——— daily_summaries ———
  if (normalized.dailySummaries.length) {
    const rows = normalized.dailySummaries.map((d) => ({ user_id: userId, source: SOURCE, ...d }));
    const { error } = await supabase
      .from('daily_summaries')
      .upsert(rows, { onConflict: 'user_id,summary_date' });
    if (error) errors.push(`daily_summaries: ${error.message}`);
    else counts.daily = rows.length;
  }

  // ——— sleep_logs ———
  if (normalized.sleep.length) {
    const rows = normalized.sleep.map((s) => ({ user_id: userId, source: SOURCE, ...s }));
    const { error } = await supabase
      .from('sleep_logs')
      .upsert(rows, { onConflict: 'user_id,sleep_date' });
    if (error) errors.push(`sleep_logs: ${error.message}`);
    else counts.sleep = rows.length;
  }

  // ——— running_dynamics ———
  if (normalized.runningDynamics.length) {
    const rows = normalized.runningDynamics.map((r) => ({ user_id: userId, source: SOURCE, ...r }));
    const { error } = await supabase
      .from('running_dynamics')
      .upsert(rows, { onConflict: 'user_id,metric_date' });
    if (error) errors.push(`running_dynamics: ${error.message}`);
    else counts.running = rows.length;
  }

  // ——— mobility_metrics ———
  if (normalized.mobility.length) {
    const rows = normalized.mobility.map((m) => ({ user_id: userId, source: SOURCE, ...m }));
    const { error } = await supabase
      .from('mobility_metrics')
      .upsert(rows, { onConflict: 'user_id,metric_date' });
    if (error) errors.push(`mobility_metrics: ${error.message}`);
    else counts.mobility = rows.length;
  }

  // ——— bp_readings ———
  // No natural key, so skip readings already recorded at the same timestamp
  // rather than duplicating them on an overlapping re-send.
  for (const reading of normalized.bloodPressure) {
    const { data: existing, error: lookupError } = await supabase
      .from('bp_readings')
      .select('id')
      .eq('user_id', userId)
      .eq('reading_date', reading.reading_date)
      .maybeSingle();
    if (lookupError) {
      errors.push(`bp_readings lookup: ${lookupError.message}`);
      continue;
    }
    if (existing) continue;
    const { error } = await supabase.from('bp_readings').insert({
      user_id: userId,
      reading_date: reading.reading_date,
      systolic: Math.round(reading.systolic),
      diastolic: Math.round(reading.diastolic),
      source: SOURCE,
    });
    if (error) errors.push(`bp_readings: ${error.message}`);
    else counts.bp += 1;
  }

  // ——— workouts ———
  // Keyed on apple_workout_id so a re-sent date range updates in place.
  const workoutIdByAppleId = new Map<string, string>();
  for (const w of normalized.workouts) {
    const { data: saved, error } = await supabase
      .from('workout_logs')
      .upsert(
        {
          user_id: userId,
          apple_workout_id: w.apple_workout_id,
          workout_type: w.workout_type,
          workout_date: w.workout_date,
          duration_minutes: w.duration_minutes,
          avg_hr: w.avg_hr,
          max_hr: w.max_hr,
          source: SOURCE,
        },
        { onConflict: 'user_id,apple_workout_id' }
      )
      .select('id')
      .maybeSingle();

    if (error || !saved) {
      counts.workoutsSkipped += 1;
      if (error) errors.push(`workout_logs: ${error.message}`);
      continue;
    }
    counts.workouts += 1;
    workoutIdByAppleId.set(w.apple_workout_id, saved.id);

    if (w.cardio) {
      // Replace rather than accumulate, so a re-send doesn't stack rows.
      await supabase.from('cardio_logs').delete().eq('workout_log_id', saved.id);
      const { error: cardioError } = await supabase.from('cardio_logs').insert({
        workout_log_id: saved.id,
        activity_type: w.workout_type.toLowerCase(),
        avg_hr: w.cardio.avg_hr,
        max_hr: w.cardio.max_hr,
        distance_miles: w.cardio.distance_miles,
        calories: w.cardio.calories,
      });
      if (cardioError) errors.push(`cardio_logs: ${cardioError.message}`);
    }
  }

  // ——— workout_routes ———
  // Only outdoor workouts carry a GPS trace, and only once the parent workout
  // row exists — routes for workouts that failed to save are dropped.
  for (const route of normalized.routes) {
    const workoutLogId = workoutIdByAppleId.get(route.apple_workout_id);
    if (!workoutLogId) continue;
    const routeFields = { ...route } as Partial<typeof route>;
    delete routeFields.apple_workout_id; // join key only; not a column
    const { error } = await supabase
      .from('workout_routes')
      .upsert(
        { user_id: userId, workout_log_id: workoutLogId, source: SOURCE, ...routeFields },
        { onConflict: 'workout_log_id' }
      );
    if (error) errors.push(`workout_routes: ${error.message}`);
    else counts.routes += 1;
  }

  const written = counts.body + counts.daily + counts.sleep + counts.workouts + counts.running + counts.mobility;
  const status = errors.length === 0 ? 'success' : written > 0 ? 'partial' : 'failed';

  await supabase.from('apple_health_sync_logs').insert({
    user_id: userId,
    status,
    automation_name: automationName,
    session_id: sessionId,
    metrics_seen: normalized.seenMetrics,
    metrics_unmapped: normalized.unmappedMetrics,
    body_metrics_written: counts.body,
    daily_written: counts.daily,
    sleep_written: counts.sleep,
    bp_written: counts.bp,
    workouts_written: counts.workouts,
    workouts_skipped: counts.workoutsSkipped,
    running_written: counts.running,
    mobility_written: counts.mobility,
    routes_written: counts.routes,
    error_message: errors.length ? errors.slice(0, 10).join('; ') : null,
    raw_payload: rawPayloadForLog(payload),
  });

  return NextResponse.json(
    {
      ok: status !== 'failed',
      status,
      written: counts,
      metrics_seen: normalized.seenMetrics,
      metrics_unmapped: normalized.unmappedMetrics,
      errors: errors.slice(0, 10),
    },
    { status: status === 'failed' ? 500 : 200 }
  );
}
