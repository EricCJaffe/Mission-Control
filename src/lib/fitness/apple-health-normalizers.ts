import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSourcePreferences, isSourceAllowed } from './source-preferences';

/**
 * Apple Health normalizers for Health Auto Export app JSON format.
 *
 * Health Auto Export exports data as JSON with a `data.metrics` array.
 * Each metric has: name, units, data (array of {date, qty}).
 * Workouts are in a `data.workouts` array.
 *
 * We also support the simpler "flat" format where metrics are top-level arrays.
 */

export type DomainSyncStats = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type AppleHealthImportResults = {
  workouts: DomainSyncStats;
  sleep: DomainSyncStats;
  daily: DomainSyncStats;
  body: DomainSyncStats;
};

export function emptyStats(): DomainSyncStats {
  return { imported: 0, updated: 0, skipped: 0, errors: 0 };
}

// ── Types for Health Auto Export JSON ────────────────────────────────

export type HAEMetricSample = {
  date: string;      // ISO date string
  qty?: number;
  Avg?: number;
  Min?: number;
  Max?: number;
  source?: string;
  // Sleep-specific fields (aggregated format)
  inBed?: number;       // minutes in bed
  asleep?: number;      // minutes asleep
  totalSleep?: number;  // minutes total sleep
  awake?: number;       // minutes awake
  deep?: number;        // minutes deep sleep
  core?: number;        // minutes core/light sleep
  rem?: number;         // minutes REM sleep
  sleepStart?: string;  // ISO date string
  sleepEnd?: string;    // ISO date string
  // Blood pressure
  systolic?: number;
  diastolic?: number;
};

export type HAEMetric = {
  name: string;
  units: string;
  data: HAEMetricSample[];
};

// Health Auto Export v2 nested value type
type HAEQtyUnits = { qty: number; units: string };
type HAEHRSummary = { min?: HAEQtyUnits; avg?: HAEQtyUnits; max?: HAEQtyUnits };

export type HAEWorkout = {
  id?: string;
  name: string;
  start: string;
  end: string;
  duration?: number;                // seconds in v2, minutes in v1
  location?: string;
  // v1 flat fields
  activeEnergy?: number;
  distance?: number;
  distanceUnit?: string;
  avgHeartRate?: number;
  maxHeartRate?: number;
  // v2 nested fields
  activeEnergyBurned?: HAEQtyUnits;
  distanceObj?: HAEQtyUnits;        // mapped from JSON key "distance" when it's an object
  heartRate?: HAEHRSummary;
  source?: string;
};

export type HAEExport = {
  data?: {
    metrics?: HAEMetric[];
    workouts?: HAEWorkout[];
  };
  // Flat format alternatives
  metrics?: HAEMetric[];
  workouts?: HAEWorkout[];
};

// ── Main import orchestrator ─────────────────────────────────────────

export async function importAppleHealthExport(
  supabase: SupabaseClient,
  userId: string,
  exportData: HAEExport
): Promise<AppleHealthImportResults> {
  const metrics = exportData.data?.metrics ?? exportData.metrics ?? [];
  const workouts = exportData.data?.workouts ?? exportData.workouts ?? [];
  const prefs = await loadSourcePreferences(supabase, userId);

  const results: AppleHealthImportResults = {
    workouts: emptyStats(),
    sleep: emptyStats(),
    daily: emptyStats(),
    body: emptyStats(),
  };

  // Process workouts (always accepted from any source — you wear one device per activity)
  for (const rawWorkout of workouts) {
    try {
      // Normalize v2 nested fields: distance may be an object {qty, units}
      const workout = { ...rawWorkout } as HAEWorkout;
      const dist = rawWorkout.distance as unknown;
      if (dist && typeof dist === 'object' && 'qty' in (dist as Record<string, unknown>)) {
        workout.distanceObj = dist as { qty: number; units: string };
        workout.distance = undefined;
      }
      const result = await upsertWorkoutFromAppleHealth(supabase, userId, workout);
      results.workouts[result]++;
    } catch {
      results.workouts.errors++;
    }
  }

  // Group metrics by name for processing
  const metricMap = new Map<string, HAEMetric>();
  for (const metric of metrics) {
    metricMap.set(metric.name.toLowerCase(), metric);
  }

  // Process sleep
  const sleepMetric = metricMap.get('sleep analysis');
  if (sleepMetric && isSourceAllowed(prefs.sleep_source, 'Apple Health')) {
    for (const sample of sleepMetric.data) {
      try {
        const result = await upsertSleepFromAppleHealth(supabase, userId, sample);
        results.sleep[result]++;
      } catch {
        results.sleep.errors++;
      }
    }
  }

  // Process daily summaries (steps, distance, calories, floors)
  if (isSourceAllowed(prefs.daily_summary_source, 'Apple Health')) {
    const dailyMap = buildDailyMap(metricMap);
    for (const [date, day] of dailyMap) {
      try {
        const result = await upsertDailySummaryFromAppleHealth(supabase, userId, date, day);
        results.daily[result]++;
      } catch {
        results.daily.errors++;
      }
    }
  }

  // Process body metrics (weight)
  const weightMetric = metricMap.get('weight') ?? metricMap.get('body mass');
  if (weightMetric && isSourceAllowed(prefs.body_metrics_source, 'Apple Health')) {
    for (const sample of weightMetric.data) {
      try {
        const result = await upsertBodyMetricFromAppleHealth(supabase, userId, sample, weightMetric.units);
        results.body[result]++;
      } catch {
        results.body.errors++;
      }
    }
  }

  // Process resting HR into body_metrics if preferred
  const rhrMetric = metricMap.get('resting heart rate');
  if (rhrMetric && isSourceAllowed(prefs.resting_hr_source, 'Apple Health')) {
    for (const sample of rhrMetric.data) {
      try {
        await upsertRHRFromAppleHealth(supabase, userId, sample);
      } catch {
        // RHR errors are non-critical
      }
    }
  }

  // Process HRV into body_metrics if preferred
  const hrvMetric = metricMap.get('heart rate variability') ?? metricMap.get('hrv');
  if (hrvMetric && isSourceAllowed(prefs.hrv_source, 'Apple Health')) {
    for (const sample of hrvMetric.data) {
      try {
        await upsertHRVFromAppleHealth(supabase, userId, sample);
      } catch {
        // HRV errors are non-critical
      }
    }
  }

  return results;
}

// ── Workout upsert ──────────────────────────────────────────────────

async function upsertWorkoutFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  workout: HAEWorkout
): Promise<'imported' | 'updated' | 'skipped'> {
  if (!workout.start || !workout.name) return 'skipped';

  const workoutDate = new Date(workout.start);
  if (isNaN(workoutDate.getTime())) return 'skipped';

  const externalId = `apple_health_${workoutDate.getTime()}_${workout.name.replace(/\s+/g, '_')}`;

  // Check for existing
  const { data: existing } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('external_id', externalId)
    .maybeSingle();

  if (existing) return 'skipped';

  // Also check for timestamp overlap (dedup with Garmin workouts)
  const overlapStart = new Date(workoutDate.getTime() - 30 * 60 * 1000).toISOString();
  const overlapEnd = new Date(workoutDate.getTime() + 30 * 60 * 1000).toISOString();

  const { data: overlap } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('user_id', userId)
    .gte('workout_date', overlapStart)
    .lte('workout_date', overlapEnd)
    .limit(1)
    .maybeSingle();

  if (overlap) return 'skipped'; // Workout already recorded from another source

  const workoutType = mapAppleWorkoutType(workout.name);
  // v2 duration is in seconds, v1 is in minutes; detect by checking if value > 300 (5 min)
  const rawDuration = workout.duration;
  const durationMinutes = rawDuration
    ? rawDuration > 300 ? Math.round(rawDuration / 60) : Math.round(rawDuration)
    : workout.end
      ? Math.round((new Date(workout.end).getTime() - workoutDate.getTime()) / 60000)
      : null;

  const { error } = await supabase.from('workout_logs').insert({
    user_id: userId,
    workout_date: workoutDate.toISOString(),
    duration_minutes: durationMinutes,
    workout_type: workoutType,
    notes: workout.name,
    external_id: externalId,
    import_source: 'Apple Health',
  });

  if (error) throw error;

  // Add cardio details if applicable
  if (['Running', 'Cycling', 'Swimming', 'Walking'].includes(workoutType)) {
    // Handle both v1 flat fields and v2 nested objects
    const rawDistance = workout.distance ?? workout.distanceObj?.qty ?? null;
    const distanceUnits = workout.distanceUnit ?? workout.distanceObj?.units ?? 'mi';
    const distanceMiles = rawDistance
      ? distanceUnits.toLowerCase() === 'km'
        ? rawDistance * 0.621371
        : rawDistance
      : null;

    const avgHR = workout.avgHeartRate ?? workout.heartRate?.avg?.qty ?? null;
    const maxHR = workout.maxHeartRate ?? workout.heartRate?.max?.qty ?? null;
    const calories = workout.activeEnergy ?? workout.activeEnergyBurned?.qty ?? null;

    await supabase.from('cardio_logs').insert({
      workout_log_id: (await supabase
        .from('workout_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('external_id', externalId)
        .single()).data?.id,
      activity_type: workoutType,
      distance_miles: distanceMiles ? parseFloat(distanceMiles.toFixed(2)) : null,
      avg_hr: avgHR ? Math.round(avgHR) : null,
      max_hr: maxHR ? Math.round(maxHR) : null,
      calories: calories ? Math.round(calories) : null,
    }).catch(() => {
      // Non-critical — workout was already logged
    });
  }

  return 'imported';
}

// ── Sleep upsert ────────────────────────────────────────────────────

async function upsertSleepFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  sample: HAEMetricSample
): Promise<'imported' | 'updated' | 'skipped'> {
  if (!sample.date) return 'skipped';

  const sleepDate = sample.date.split('T')[0];
  const totalSleepMinutes = sample.totalSleep ?? sample.asleep ?? sample.qty ?? 0;
  if (totalSleepMinutes <= 0) return 'skipped';

  const totalSleepSeconds = Math.round(totalSleepMinutes * 60);

  const payload = {
    user_id: userId,
    sleep_date: sleepDate,
    sleep_start: sample.sleepStart ?? sample.date,
    sleep_end: sample.sleepEnd ?? sample.date,
    total_sleep_seconds: totalSleepSeconds,
    deep_sleep_seconds: sample.deep ? Math.round(sample.deep * 60) : null,
    light_sleep_seconds: sample.core ? Math.round(sample.core * 60) : null,
    rem_sleep_seconds: sample.rem ? Math.round(sample.rem * 60) : null,
    awake_seconds: sample.awake ? Math.round(sample.awake * 60) : null,
    source: 'Apple Health',
    notes: 'Imported from Health Auto Export',
  };

  const { data: existing } = await supabase
    .from('sleep_logs')
    .select('id, source')
    .eq('user_id', userId)
    .eq('sleep_date', sleepDate)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('sleep_logs').insert(payload);
    if (error) throw error;
    return 'imported';
  }

  // Don't overwrite data from another source
  if (existing.source !== 'Apple Health') return 'skipped';

  const { error } = await supabase
    .from('sleep_logs')
    .update(payload)
    .eq('id', existing.id);
  if (error) throw error;
  return 'updated';
}

// ── Daily summary helpers ───────────────────────────────────────────

type DailySummaryData = {
  steps?: number;
  distance_miles?: number;
  floors?: number;
  active_calories?: number;
  total_calories?: number;
  resting_hr?: number;
};

function buildDailyMap(metricMap: Map<string, HAEMetric>): Map<string, DailySummaryData> {
  const dailyMap = new Map<string, DailySummaryData>();

  function getOrCreate(date: string): DailySummaryData {
    let entry = dailyMap.get(date);
    if (!entry) {
      entry = {};
      dailyMap.set(date, entry);
    }
    return entry;
  }

  const steps = metricMap.get('step count') ?? metricMap.get('steps');
  if (steps) {
    for (const s of steps.data) {
      if (!s.date || s.qty == null) continue;
      const d = s.date.split('T')[0];
      getOrCreate(d).steps = (getOrCreate(d).steps ?? 0) + Math.round(s.qty);
    }
  }

  const distance = metricMap.get('walking + running distance') ?? metricMap.get('distance walking running');
  if (distance) {
    for (const s of distance.data) {
      if (!s.date || s.qty == null) continue;
      const d = s.date.split('T')[0];
      // Health Auto Export default is miles
      const miles = distance.units?.toLowerCase() === 'km' ? s.qty * 0.621371 : s.qty;
      getOrCreate(d).distance_miles = parseFloat(miles.toFixed(2));
    }
  }

  const floors = metricMap.get('flights climbed');
  if (floors) {
    for (const s of floors.data) {
      if (!s.date || s.qty == null) continue;
      const d = s.date.split('T')[0];
      getOrCreate(d).floors = Math.round(s.qty);
    }
  }

  const activeCal = metricMap.get('active energy') ?? metricMap.get('active energy burned');
  if (activeCal) {
    for (const s of activeCal.data) {
      if (!s.date || s.qty == null) continue;
      const d = s.date.split('T')[0];
      getOrCreate(d).active_calories = Math.round(s.qty);
    }
  }

  const basalCal = metricMap.get('basal energy burned') ?? metricMap.get('resting energy');
  if (basalCal) {
    for (const s of basalCal.data) {
      if (!s.date || s.qty == null) continue;
      const d = s.date.split('T')[0];
      const entry = getOrCreate(d);
      const basal = Math.round(s.qty);
      entry.total_calories = (entry.active_calories ?? 0) + basal;
    }
  }

  return dailyMap;
}

async function upsertDailySummaryFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  day: DailySummaryData
): Promise<'imported' | 'updated' | 'skipped'> {
  if (!day.steps && !day.distance_miles && !day.active_calories) return 'skipped';

  const payload = {
    user_id: userId,
    summary_date: date,
    total_steps: day.steps ?? null,
    distance_miles: day.distance_miles ?? null,
    floors_climbed: day.floors ?? null,
    total_calories: day.total_calories ?? null,
    active_calories: day.active_calories ?? null,
    resting_hr: day.resting_hr ?? null,
    source: 'Apple Health',
  };

  const { data: existing } = await supabase
    .from('daily_summaries')
    .select('id, source')
    .eq('user_id', userId)
    .eq('summary_date', date)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('daily_summaries').insert(payload);
    if (error) throw error;
    return 'imported';
  }

  if (existing.source !== 'Apple Health') return 'skipped';

  const { error } = await supabase
    .from('daily_summaries')
    .update(payload)
    .eq('id', existing.id);
  if (error) throw error;
  return 'updated';
}

// ── Body metrics ────────────────────────────────────────────────────

async function upsertBodyMetricFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  sample: HAEMetricSample,
  units: string
): Promise<'imported' | 'updated' | 'skipped'> {
  if (!sample.date || sample.qty == null) return 'skipped';

  const metricDate = sample.date.split('T')[0];
  const weightLbs = units?.toLowerCase() === 'kg'
    ? parseFloat((sample.qty * 2.20462).toFixed(1))
    : units?.toLowerCase() === 'lb' || units?.toLowerCase() === 'lbs'
      ? parseFloat(sample.qty.toFixed(1))
      : parseFloat(sample.qty.toFixed(1)); // assume lbs if unspecified

  const { data: existing } = await supabase
    .from('body_metrics')
    .select('id, weight_source')
    .eq('user_id', userId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('body_metrics').insert({
      user_id: userId,
      metric_date: metricDate,
      weight_lbs: weightLbs,
      weight_source: 'Apple Health',
      notes: 'Imported from Health Auto Export',
    });
    if (error) throw error;
    return 'imported';
  }

  // Don't overwrite Withings body composition data
  if (existing.weight_source !== 'Apple Health') return 'skipped';

  const { error } = await supabase
    .from('body_metrics')
    .update({ weight_lbs: weightLbs, weight_source: 'Apple Health' })
    .eq('id', existing.id);
  if (error) throw error;
  return 'updated';
}

// ── RHR / HRV helpers ──────────────────────────────────────────────

async function upsertRHRFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  sample: HAEMetricSample
): Promise<void> {
  if (!sample.date || sample.qty == null) return;
  const metricDate = sample.date.split('T')[0];
  const rhr = Math.round(sample.qty);

  const { data: existing } = await supabase
    .from('body_metrics')
    .select('id, resting_hr')
    .eq('user_id', userId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  if (existing) {
    if (existing.resting_hr == null) {
      await supabase.from('body_metrics').update({ resting_hr: rhr }).eq('id', existing.id);
    }
  } else {
    await supabase.from('body_metrics').insert({
      user_id: userId,
      metric_date: metricDate,
      resting_hr: rhr,
    });
  }
}

async function upsertHRVFromAppleHealth(
  supabase: SupabaseClient,
  userId: string,
  sample: HAEMetricSample
): Promise<void> {
  if (!sample.date || sample.qty == null) return;
  const metricDate = sample.date.split('T')[0];
  const hrv = Math.round(sample.qty);

  const { data: existing } = await supabase
    .from('body_metrics')
    .select('id, hrv_ms')
    .eq('user_id', userId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  if (existing) {
    if (existing.hrv_ms == null) {
      await supabase.from('body_metrics').update({ hrv_ms: hrv }).eq('id', existing.id);
    }
  } else {
    await supabase.from('body_metrics').insert({
      user_id: userId,
      metric_date: metricDate,
      hrv_ms: hrv,
    });
  }
}

// ── Workout type mapper ─────────────────────────────────────────────

function mapAppleWorkoutType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('run')) return 'Running';
  if (lower.includes('cycling') || lower.includes('bike') || lower.includes('biking')) return 'Cycling';
  if (lower.includes('swim')) return 'Swimming';
  if (lower.includes('walk')) return 'Walking';
  if (lower.includes('hik')) return 'Hiking';
  if (lower.includes('strength') || lower.includes('weight') || lower.includes('functional')) return 'Strength';
  if (lower.includes('yoga')) return 'Yoga';
  if (lower.includes('hiit') || lower.includes('high intensity')) return 'HIIT';
  if (lower.includes('rowing') || lower.includes('rower')) return 'Rowing';
  if (lower.includes('elliptical')) return 'Elliptical';
  return 'Other';
}
