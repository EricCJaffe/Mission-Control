import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WithingsActivityRecord,
  WithingsMeasureGroup,
  WithingsSleepSeries,
} from './withings-client';

export type DomainSyncStats = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type WithingsSyncResults = {
  bp: DomainSyncStats;
  weight: DomainSyncStats;
  dailyAggregates: DomainSyncStats;
  sleep: DomainSyncStats;
};

export function emptyDomainSyncStats(): DomainSyncStats {
  return { imported: 0, updated: 0, skipped: 0, errors: 0 };
}

function roundMaybe(value: number | null | undefined, decimals = 1): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function kgToLbs(valueKg: number | null | undefined): number | null {
  if (valueKg == null) return null;
  return roundMaybe(valueKg * 2.20462, 1);
}

function metersToMiles(valueMeters: number | null | undefined): number | null {
  if (valueMeters == null) return null;
  return roundMaybe(valueMeters / 1609.34, 2);
}

function parseMeasureValue(measure?: { value: number; unit: number } | null): number | null {
  if (!measure) return null;
  return measure.value * 10 ** measure.unit;
}

function shallowEqualSubset(existing: Record<string, unknown> | null, payload: Record<string, unknown>, keys: string[]): boolean {
  if (!existing) return false;
  return keys.every((key) => {
    const left = existing[key];
    const right = payload[key];
    if (left == null && right == null) return true;
    return String(left) === String(right);
  });
}

function extractMeasureMap(group: WithingsMeasureGroup): Map<number, number> {
  const map = new Map<number, number>();
  for (const measure of group.measures || []) {
    map.set(measure.type, parseMeasureValue(measure) ?? 0);
  }
  return map;
}

export async function upsertBloodPressureFromMeasureGroup(
  supabase: SupabaseClient,
  userId: string,
  group: WithingsMeasureGroup
): Promise<'imported' | 'updated' | 'skipped'> {
  const measures = extractMeasureMap(group);
  const systolic = roundMaybe(measures.get(10), 0);
  const diastolic = roundMaybe(measures.get(9), 0);
  const pulse = roundMaybe(measures.get(11), 0);

  if (!systolic || !diastolic) {
    return 'skipped';
  }

  const readingDate = new Date(group.date * 1000).toISOString();
  const payload = {
    user_id: userId,
    reading_date: readingDate,
    systolic: Number(systolic),
    diastolic: Number(diastolic),
    pulse: pulse ? Number(pulse) : null,
    source: 'Withings',
    withings_data: group,
    notes: 'Imported from Withings API',
  };

  const lower = new Date(group.date * 1000 - 2 * 60 * 1000).toISOString();
  const upper = new Date(group.date * 1000 + 2 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('bp_readings')
    .select('id, systolic, diastolic, pulse')
    .eq('user_id', userId)
    .gte('reading_date', lower)
    .lte('reading_date', upper)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('bp_readings').insert(payload);
    if (error) throw error;
    return 'imported';
  }

  if (shallowEqualSubset(existing, payload, ['systolic', 'diastolic', 'pulse'])) {
    return 'skipped';
  }

  const { error } = await supabase
    .from('bp_readings')
    .update(payload)
    .eq('id', existing.id);

  if (error) throw error;
  return 'updated';
}

export async function upsertBodyMetricsFromMeasureGroup(
  supabase: SupabaseClient,
  userId: string,
  group: WithingsMeasureGroup
): Promise<'imported' | 'updated' | 'skipped'> {
  const measures = extractMeasureMap(group);
  const metricDate = new Date(group.date * 1000).toISOString().split('T')[0];

  const weightKg = measures.get(1) ?? null;
  const fatRatio = measures.get(6) ?? null;
  const muscleKg = measures.get(76) ?? measures.get(5) ?? null;
  const boneKg = measures.get(88) ?? null;
  const hydrationKg = measures.get(77) ?? null;
  if (!weightKg) {
    return 'skipped';
  }

  const payload = {
    user_id: userId,
    metric_date: metricDate,
    weight_lbs: kgToLbs(weightKg),
    body_fat_pct: fatRatio != null ? roundMaybe(fatRatio > 1 ? fatRatio : fatRatio * 100, 1) : null,
    muscle_mass_lbs: kgToLbs(muscleKg),
    bone_mass_lbs: kgToLbs(boneKg),
    hydration_lbs: kgToLbs(hydrationKg),
    bmi: null,
    weight_source: 'Withings',
    withings_data: group,
    notes: 'Imported from Withings API',
  };

  const { data: existing } = await supabase
    .from('body_metrics')
    .select('id, weight_lbs, body_fat_pct, muscle_mass_lbs, bone_mass_lbs, hydration_lbs, bmi, weight_source')
    .eq('user_id', userId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('body_metrics').insert(payload);
    if (error) throw error;
    return 'imported';
  }

  if (shallowEqualSubset(existing, payload, ['weight_lbs', 'body_fat_pct', 'muscle_mass_lbs', 'bone_mass_lbs', 'hydration_lbs', 'bmi', 'weight_source'])) {
    return 'skipped';
  }

  const { error } = await supabase.from('body_metrics').upsert(payload, {
    onConflict: 'user_id,metric_date',
    ignoreDuplicates: false,
  });
  if (error) throw error;
  return 'updated';
}

export async function upsertDailySummaryFromActivity(
  supabase: SupabaseClient,
  userId: string,
  activity: WithingsActivityRecord
): Promise<'imported' | 'updated' | 'skipped'> {
  const summaryDate = typeof activity.date === 'string' ? activity.date : null;
  if (!summaryDate) return 'skipped';

  const payload = {
    user_id: userId,
    summary_date: summaryDate,
    total_steps: typeof activity.steps === 'number' ? Math.round(activity.steps) : null,
    distance_miles: metersToMiles(typeof activity.distance === 'number' ? activity.distance : null),
    floors_climbed: typeof activity.elevation === 'number' ? Math.round(activity.elevation) : null,
    total_calories: typeof activity.totalcalories === 'number' ? Math.round(activity.totalcalories) : null,
    active_calories: typeof activity.calories === 'number' ? Math.round(activity.calories) : null,
    resting_hr: typeof activity.hr_average === 'number' ? Math.round(activity.hr_average) : null,
    min_hr: typeof activity.hr_min === 'number' ? Math.round(activity.hr_min) : null,
    max_hr: typeof activity.hr_max === 'number' ? Math.round(activity.hr_max) : null,
    source: 'Withings',
  };

  const { data: existing } = await supabase
    .from('daily_summaries')
    .select('id, total_steps, distance_miles, floors_climbed, total_calories, active_calories, resting_hr, min_hr, max_hr, source')
    .eq('user_id', userId)
    .eq('summary_date', summaryDate)
    .maybeSingle();

  let result: 'imported' | 'updated' | 'skipped' = 'skipped';

  if (!existing) {
    const { error } = await supabase.from('daily_summaries').insert(payload);
    if (error) throw error;
    result = 'imported';
  } else if (!shallowEqualSubset(existing, payload, ['total_steps', 'distance_miles', 'floors_climbed', 'total_calories', 'active_calories', 'resting_hr', 'min_hr', 'max_hr', 'source'])) {
    const { error } = await supabase.from('daily_summaries').upsert(payload, {
      onConflict: 'user_id,summary_date',
      ignoreDuplicates: false,
    });
    if (error) throw error;
    result = 'updated';
  }

  if (payload.resting_hr != null) {
    const { error: bodyMetricError } = await supabase.from('body_metrics').upsert({
      user_id: userId,
      metric_date: summaryDate,
      resting_hr: payload.resting_hr,
      withings_data: activity,
    }, {
      onConflict: 'user_id,metric_date',
      ignoreDuplicates: false,
    });

    if (bodyMetricError) {
      throw bodyMetricError;
    }
  }

  return result;
}

export async function upsertSleepFromSeries(
  supabase: SupabaseClient,
  userId: string,
  series: WithingsSleepSeries
): Promise<'imported' | 'updated' | 'skipped'> {
  const startSeconds = typeof series.startdate === 'number' ? series.startdate : null;
  const endSeconds = typeof series.enddate === 'number' ? series.enddate : null;
  if (!startSeconds || !endSeconds) return 'skipped';

  const sleepStart = new Date(startSeconds * 1000).toISOString();
  const sleepEnd = new Date(endSeconds * 1000).toISOString();
  const sleepDate = sleepStart.split('T')[0];
  const totalSleepSeconds = numberOrNull(series.total_sleep_duration ?? series.asleepduration);

  if (!totalSleepSeconds || totalSleepSeconds <= 0) {
    return 'skipped';
  }

  const payload = {
    user_id: userId,
    sleep_date: sleepDate,
    sleep_start: sleepStart,
    sleep_end: sleepEnd,
    total_sleep_seconds: totalSleepSeconds,
    light_sleep_seconds: numberOrNull(series.lightsleepduration),
    deep_sleep_seconds: numberOrNull(series.deepsleepduration),
    rem_sleep_seconds: numberOrNull(series.remsleepduration),
    awake_seconds: numberOrNull(series.wakeupduration),
    avg_hr: numberOrNull(series.hr_average),
    min_hr: numberOrNull(series.hr_min),
    max_hr: numberOrNull(series.hr_max),
    duration_to_sleep_seconds: numberOrNull(series.durationtosleep),
    duration_to_wake_seconds: numberOrNull(series.durationtowakeup),
    wake_up_count: numberOrNull(series.wakeupcount),
    snoring_seconds: numberOrNull(series.snoring),
    avg_respiration: decimalOrNull(series.rr_average),
    source: 'Withings',
    notes: 'Imported from Withings API',
  };

  const { data: existing } = await supabase
    .from('sleep_logs')
    .select('id, total_sleep_seconds, light_sleep_seconds, deep_sleep_seconds, rem_sleep_seconds, awake_seconds, avg_hr, min_hr, max_hr, duration_to_sleep_seconds, duration_to_wake_seconds, wake_up_count, snoring_seconds, avg_respiration, source')
    .eq('user_id', userId)
    .eq('sleep_date', sleepDate)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('sleep_logs').insert(payload);
    if (error) throw error;
    return 'imported';
  }

  if (shallowEqualSubset(existing, payload, ['total_sleep_seconds', 'light_sleep_seconds', 'deep_sleep_seconds', 'rem_sleep_seconds', 'awake_seconds', 'avg_hr', 'min_hr', 'max_hr', 'duration_to_sleep_seconds', 'duration_to_wake_seconds', 'wake_up_count', 'snoring_seconds', 'avg_respiration', 'source'])) {
    return 'skipped';
  }

  const { error } = await supabase.from('sleep_logs').upsert(payload, {
    onConflict: 'user_id,sleep_date',
    ignoreDuplicates: false,
  });
  if (error) throw error;
  return 'updated';
}

function numberOrNull(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
  return numeric == null || Number.isNaN(numeric) ? null : Math.round(numeric);
}

function decimalOrNull(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
  return numeric == null || Number.isNaN(numeric) ? null : roundMaybe(numeric, 1);
}
