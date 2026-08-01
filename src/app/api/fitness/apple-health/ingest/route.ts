import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
const WITHINGS_SOURCE = 'Withings';

/**
 * Source-of-truth split.
 *
 * Withings owns weight and body composition — the scale is the instrument that
 * actually measured them, and Apple only ever had these because Health Mate
 * mirrored them across. On a date Withings has already written, Apple's copy of
 * these fields is dropped rather than upserted over the top. Apple keeps the
 * rest of the row (resting HR, HRV, VO2 max, SpO2, respiratory rate), which
 * comes from the watch and Withings never supplies.
 *
 * Blood pressure is handled more bluntly — see the bp_readings section.
 */
const WITHINGS_OWNED_FIELDS = ['weight_lbs', 'body_fat_pct', 'muscle_mass_lbs', 'bmi'] as const;

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

type Row = Record<string, unknown>;

/**
 * Upserts rows in batches that share an identical column set.
 *
 * PostgREST normalises a batch upsert to the UNION of every row's columns and
 * null-fills whatever a given row omits — so sending one row without
 * `weight_lbs` alongside others that have it writes NULL over the existing
 * weight rather than leaving it alone. Apple payloads are naturally ragged
 * (a date may carry HRV but no weight), which makes that a live hazard on
 * every sync, not just an edge case.
 *
 * Grouping by column signature means each statement only ever names columns
 * that every row in it actually supplies.
 */
async function upsertGrouped(
  supabase: SupabaseClient,
  table: string,
  rows: Row[],
  onConflict: string
): Promise<{ written: number; errors: string[] }> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    // Undefined values are dropped during serialisation, so they must not
    // count towards the signature either.
    const defined: Row = {};
    for (const [k, v] of Object.entries(row)) if (v !== undefined) defined[k] = v;
    const signature = Object.keys(defined).sort().join(',');
    const list = groups.get(signature);
    if (list) list.push(defined);
    else groups.set(signature, [defined]);
  }

  let written = 0;
  const errors: string[] = [];
  const keyColumns = new Set(onConflict.split(',').map((c) => c.trim()));

  for (const [signature, group] of groups) {
    // A row carrying nothing but its conflict key has no update to make.
    const hasPayload = signature.split(',').some((c) => !keyColumns.has(c));
    if (!hasPayload) continue;
    // The client is untyped here (dynamic table name), so the row shape
    // can't be inferred; the column set is validated by Postgres itself.
    const { error } = await supabase.from(table).upsert(group as never, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
    else written += group.length;
  }

  return { written, errors };
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
    bpSkipped: 0,
    bodyFieldsDeferred: 0,
    workouts: 0,
    workoutsSkipped: 0,
    running: 0,
    mobility: 0,
    routes: 0,
  };
  const errors: string[] = [];

  // ——— body_metrics ———
  // Withings owns weight and body composition (see WITHINGS_OWNED_FIELDS).
  // Apple still supplies the wearable-only metrics on the same row — resting
  // HR, HRV, VO2 max, SpO2, respiratory rate — so this writes the row but
  // strips the Withings-owned fields on any date Withings has already claimed.
  if (normalized.bodyMetrics.length) {
    const dates = normalized.bodyMetrics.map((m) => m.metric_date);
    const { data: existingRows, error: lookupError } = await supabase
      .from('body_metrics')
      .select('metric_date,weight_source')
      .eq('user_id', userId)
      .in('metric_date', dates);
    if (lookupError) errors.push(`body_metrics lookup: ${lookupError.message}`);

    const withingsOwned = new Set(
      (existingRows ?? [])
        .filter((r) => r.weight_source === WITHINGS_SOURCE)
        .map((r) => r.metric_date as string)
    );

    const rows = normalized.bodyMetrics.map((m) => {
      const row: Record<string, unknown> = { user_id: userId, ...m };
      if (withingsOwned.has(m.metric_date)) {
        // Never overwrite a Withings reading with an Apple one. Dropping the
        // keys is only safe because upsertGrouped batches by column set —
        // a plain batch upsert would null these instead.
        for (const field of WITHINGS_OWNED_FIELDS) delete row[field];
        counts.bodyFieldsDeferred += 1;
      } else if (m.weight_lbs !== undefined) {
        row.weight_source = SOURCE;
      }
      return row;
    });

    const res = await upsertGrouped(supabase, 'body_metrics', rows, 'user_id,metric_date');
    errors.push(...res.errors);
    counts.body = res.written;
  }

  // ——— daily_summaries ———
  if (normalized.dailySummaries.length) {
    const rows = normalized.dailySummaries.map((d) => ({ user_id: userId, source: SOURCE, ...d }));
    const res = await upsertGrouped(supabase, 'daily_summaries', rows, 'user_id,summary_date');
    errors.push(...res.errors);
    counts.daily = res.written;
  }

  // ——— sleep_logs ———
  if (normalized.sleep.length) {
    const rows = normalized.sleep.map((s) => ({ user_id: userId, source: SOURCE, ...s }));
    const res = await upsertGrouped(supabase, 'sleep_logs', rows, 'user_id,sleep_date');
    errors.push(...res.errors);
    counts.sleep = res.written;
  }

  // ——— running_dynamics ———
  if (normalized.runningDynamics.length) {
    const rows = normalized.runningDynamics.map((r) => ({ user_id: userId, source: SOURCE, ...r }));
    const res = await upsertGrouped(supabase, 'running_dynamics', rows, 'user_id,metric_date');
    errors.push(...res.errors);
    counts.running = res.written;
  }

  // ——— mobility_metrics ———
  if (normalized.mobility.length) {
    const rows = normalized.mobility.map((m) => ({ user_id: userId, source: SOURCE, ...m }));
    const res = await upsertGrouped(supabase, 'mobility_metrics', rows, 'user_id,metric_date');
    errors.push(...res.errors);
    counts.mobility = res.written;
  }

  // ——— bp_readings: intentionally NOT written from Apple Health ———
  //
  // Withings is the source of truth for blood pressure, and the two paths
  // cannot be de-duplicated reliably: Apple Health flattens a reading to local
  // midnight while the Withings API keeps the real measurement time, so the
  // same cuff reading arrives with different timestamps and slips past any
  // timestamp match. This actually happened before this rule existed —
  // 2026-03-02 (142/90) and 2026-03-08 (153/91) were each stored twice.
  //
  // Readings still reach the app through /api/fitness/withings/sync. The
  // parsed values are counted here purely so the sync log shows what was
  // available and skipped.
  counts.bpSkipped = normalized.bloodPressure.length;

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
