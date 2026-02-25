// ============================================================
// GARMIN SYNC — Activity matching and data extraction
// Handles linking Garmin activities to planned workouts
// ============================================================

/**
 * Map Garmin activity types to our workout types.
 * Garmin uses a large set of activity types:
 * https://developer.garmin.com/gc-developer-program/activity-api/
 */
const GARMIN_ACTIVITY_TYPE_MAP: Record<string, { workout_type: string; activity_type: string }> = {
  // Running
  running: { workout_type: 'cardio', activity_type: 'run' },
  treadmill_running: { workout_type: 'cardio', activity_type: 'treadmill' },
  trail_running: { workout_type: 'cardio', activity_type: 'run' },
  indoor_running: { workout_type: 'cardio', activity_type: 'treadmill' },
  // Walking
  walking: { workout_type: 'cardio', activity_type: 'walk' },
  casual_walking: { workout_type: 'cardio', activity_type: 'walk' },
  // Cycling
  cycling: { workout_type: 'cardio', activity_type: 'bike' },
  road_biking: { workout_type: 'cardio', activity_type: 'bike' },
  indoor_cycling: { workout_type: 'cardio', activity_type: 'bike' },
  mountain_biking: { workout_type: 'cardio', activity_type: 'bike' },
  gravel_cycling: { workout_type: 'cardio', activity_type: 'bike' },
  // Swimming
  open_water_swimming: { workout_type: 'cardio', activity_type: 'swim' },
  lap_swimming: { workout_type: 'cardio', activity_type: 'swim' },
  // Strength
  strength_training: { workout_type: 'strength', activity_type: 'strength' },
  // HIIT
  hiit: { workout_type: 'hiit', activity_type: 'hiit' },
  cardio: { workout_type: 'hiit', activity_type: 'hiit' },
  // Other cardio
  elliptical: { workout_type: 'cardio', activity_type: 'elliptical' },
  stair_climbing: { workout_type: 'cardio', activity_type: 'elliptical' },
};

/**
 * Map a Garmin activity type string to our internal types.
 * Returns null if the activity type is unknown.
 */
export function mapGarminActivityType(garminType: string): { workout_type: string; activity_type: string } | null {
  const normalized = garminType.toLowerCase().replace(/[- ]/g, '_');
  return GARMIN_ACTIVITY_TYPE_MAP[normalized] ?? null;
}

/**
 * Extracted Garmin activity data for matching and import.
 */
export type GarminActivity = {
  activity_id: string;
  activity_type: string;
  start_time: string;         // ISO datetime
  duration_seconds: number;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  calories: number | null;
  distance_meters: number | null;
  avg_speed_mps: number | null;
  avg_power_watts: number | null;
  max_power_watts: number | null;
  normalized_power: number | null;
  // Zone times from Garmin (may be available)
  hr_zones_minutes: { z1: number; z2: number; z3: number; z4: number; z5: number } | null;
  // Garmin's own metrics
  training_effect_aerobic: number | null;
  training_effect_anaerobic: number | null;
  vo2_max: number | null;
  // Full raw data
  raw_data: Record<string, unknown>;
};

export type PlannedWorkoutForMatch = {
  id: string;
  scheduled_date: string;
  workout_type: string | null;
  day_label: string | null;
  status: string;
};

export type MatchResult = {
  matched: boolean;
  planned_workout_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

/**
 * Try to match a Garmin activity to a planned workout.
 *
 * Matching criteria:
 * 1. Same date (activity start date = planned workout scheduled_date)
 * 2. Compatible workout type (Garmin running → planned cardio, etc.)
 * 3. Planned workout not already completed
 *
 * Returns match result with confidence level.
 */
export function matchActivityToPlannedWorkout(
  activity: GarminActivity,
  plannedWorkouts: PlannedWorkoutForMatch[],
): MatchResult {
  const mapped = mapGarminActivityType(activity.activity_type);
  if (!mapped) {
    return { matched: false, planned_workout_id: null, confidence: 'low', reason: `Unknown Garmin type: ${activity.activity_type}` };
  }

  const activityDate = activity.start_time.slice(0, 10);

  // Filter to same day + pending status
  const candidates = plannedWorkouts.filter(
    pw => pw.scheduled_date === activityDate && pw.status === 'pending',
  );

  if (candidates.length === 0) {
    return { matched: false, planned_workout_id: null, confidence: 'high', reason: 'No planned workouts on this date' };
  }

  // Try exact type match first
  const exactMatch = candidates.find(pw => pw.workout_type === mapped.workout_type);
  if (exactMatch) {
    return {
      matched: true,
      planned_workout_id: exactMatch.id,
      confidence: 'high',
      reason: `Type match: ${activity.activity_type} → ${mapped.workout_type} (planned: ${exactMatch.day_label ?? exactMatch.workout_type})`,
    };
  }

  // Try compatible type match (e.g., HIIT could match cardio plan)
  const compatibleMatch = candidates.find(pw => {
    if (mapped.workout_type === 'hiit' && pw.workout_type === 'cardio') return true;
    if (mapped.workout_type === 'cardio' && pw.workout_type === 'hiit') return true;
    return false;
  });

  if (compatibleMatch) {
    return {
      matched: true,
      planned_workout_id: compatibleMatch.id,
      confidence: 'medium',
      reason: `Compatible match: ${activity.activity_type} → ${mapped.workout_type} (planned: ${compatibleMatch.day_label ?? compatibleMatch.workout_type})`,
    };
  }

  // No match but there are planned workouts — maybe substituted
  return {
    matched: false,
    planned_workout_id: null,
    confidence: 'medium',
    reason: `No type match on ${activityDate}. Planned: ${candidates.map(c => c.workout_type).join(', ')}`,
  };
}

/**
 * Convert Garmin activity data to our CardioLog format.
 * Handles unit conversions (meters → miles, m/s → min/mile, etc.)
 */
export function garminActivityToCardioLog(activity: GarminActivity): {
  activity_type: string;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  time_in_zone1_min: number | null;
  time_in_zone2_min: number | null;
  time_in_zone3_min: number | null;
  time_in_zone4_min: number | null;
  distance_miles: number | null;
  avg_pace_per_mile: string | null;
  calories: number | null;
  avg_power_watts: number | null;
  max_power_watts: number | null;
  normalized_power: number | null;
  garmin_data: Record<string, unknown>;
} {
  const mapped = mapGarminActivityType(activity.activity_type);
  const activityType = mapped?.activity_type ?? 'other';

  // Convert distance: meters → miles
  const distanceMiles = activity.distance_meters
    ? Math.round(activity.distance_meters / 1609.34 * 100) / 100
    : null;

  // Convert speed to pace: m/s → min/mile
  let avgPacePerMile: string | null = null;
  if (activity.avg_speed_mps && activity.avg_speed_mps > 0) {
    const secondsPerMile = 1609.34 / activity.avg_speed_mps;
    const paceMinutes = Math.floor(secondsPerMile / 60);
    const paceSeconds = Math.round(secondsPerMile % 60);
    avgPacePerMile = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;
  }

  // Map Garmin's 5-zone system to our 4-zone system
  let z1 = null, z2 = null, z3 = null, z4 = null;
  if (activity.hr_zones_minutes) {
    z1 = activity.hr_zones_minutes.z1;
    z2 = activity.hr_zones_minutes.z2;
    z3 = activity.hr_zones_minutes.z3;
    z4 = activity.hr_zones_minutes.z4 + activity.hr_zones_minutes.z5; // merge Z4+Z5 into Z4
  }

  return {
    activity_type: activityType,
    avg_hr: activity.avg_hr,
    max_hr: activity.max_hr,
    min_hr: activity.min_hr,
    time_in_zone1_min: z1,
    time_in_zone2_min: z2,
    time_in_zone3_min: z3,
    time_in_zone4_min: z4,
    distance_miles: distanceMiles,
    avg_pace_per_mile: avgPacePerMile,
    calories: activity.calories,
    avg_power_watts: activity.avg_power_watts,
    max_power_watts: activity.max_power_watts,
    normalized_power: activity.normalized_power,
    garmin_data: activity.raw_data,
  };
}

/**
 * Check if a Garmin activity has already been imported.
 * Uses garmin_activity_id on workout_logs for deduplication.
 */
export function buildDeduplicationCheck(activityId: string) {
  return {
    column: 'garmin_activity_id' as const,
    value: activityId,
  };
}

/**
 * Extract strength workout HR data from a Garmin Strength activity.
 * The Fenix 8 in Strength mode records continuous HR.
 */
export function extractStrengthHR(activity: GarminActivity): {
  avg_hr: number | null;
  max_hr: number | null;
  garmin_data: Record<string, unknown>;
} {
  return {
    avg_hr: activity.avg_hr,
    max_hr: activity.max_hr,
    garmin_data: {
      garmin_activity_id: activity.activity_id,
      activity_type: activity.activity_type,
      duration_seconds: activity.duration_seconds,
      calories: activity.calories,
      training_effect_aerobic: activity.training_effect_aerobic,
      hr_zones_minutes: activity.hr_zones_minutes,
    },
  };
}
