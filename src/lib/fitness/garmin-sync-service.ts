// ============================================================
// GARMIN SYNC SERVICE — Orchestrates data fetching and transformation
// Uses existing garmin-sync.ts helpers for activity matching
// ============================================================

import { GarminClient, type DailySummary, type HRVData, type BodyBatteryData, type SleepData, type Activity } from './garmin-client';
import { mapGarminActivityType, matchActivityToPlannedWorkout, garminActivityToCardioLog, type GarminActivity, type PlannedWorkoutForMatch } from './garmin-sync';
import { supabaseServer } from '@/lib/supabase/server';

export type SyncResult = {
  success: boolean;
  metricsCount: number;
  activitiesCount: number;
  errors: string[];
};

/**
 * Service to sync Garmin data to database.
 */
export class GarminSyncService {
  constructor(
    private client: GarminClient,
    private userId: string
  ) {}

  /**
   * Sync daily metrics (RHR, HRV, body battery, sleep) for a specific date.
   */
  async syncDailyMetrics(date: string): Promise<void> {
    try {
      // Fetch all daily data in parallel
      const [summary, hrv, bodyBattery, sleep] = await Promise.all([
        this.client.getDailySummary(date),
        this.client.getDailyHRV(date),
        this.client.getBodyBattery(date),
        this.client.getSleepData(date),
      ]);

      // Skip if no data available for this date
      if (!summary && !hrv && !bodyBattery && !sleep) {
        return;
      }

      // Build body_metrics payload
      const payload: Record<string, any> = {
        user_id: this.userId,
        metric_date: date,
        updated_at: new Date().toISOString(),
      };

      // Add summary data
      if (summary) {
        payload.resting_hr = summary.restingHeartRate;
      }

      // Add HRV data
      if (hrv) {
        payload.hrv_ms = hrv.lastNightAvg;
      }

      // Add body battery
      if (bodyBattery) {
        payload.body_battery = bodyBattery.charged;
      }

      // Add sleep data
      if (sleep) {
        payload.sleep_score = sleep.sleepScore;
        if (sleep.sleepTimeSeconds) {
          payload.sleep_duration_min = Math.round(sleep.sleepTimeSeconds / 60);
        }
        if (sleep.deepSleepSeconds) {
          payload.deep_sleep_min = Math.round(sleep.deepSleepSeconds / 60);
        }
        if (sleep.remSleepSeconds) {
          payload.rem_sleep_min = Math.round(sleep.remSleepSeconds / 60);
        }
        if (sleep.awakeSleepSeconds) {
          payload.awake_min = Math.round(sleep.awakeSleepSeconds / 60);
        }
      }

      // Store raw Garmin data
      payload.garmin_data = {
        summary,
        hrv,
        bodyBattery,
        sleep,
        synced_at: new Date().toISOString(),
      };

      // Upsert into body_metrics (unique on user_id + metric_date)
      const supabase = await supabaseServer();
      const { error } = await supabase
        .from('body_metrics')
        .upsert(payload, { onConflict: 'user_id,metric_date' });

      if (error) {
        throw new Error(`Failed to upsert body_metrics: ${error.message}`);
      }

      console.log(`✓ Synced metrics for ${date}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to sync metrics for ${date}: ${message}`);
    }
  }

  /**
   * Sync activities (cardio and strength workouts) within date range.
   */
  async syncActivities(startDate: string, endDate: string): Promise<number> {
    try {
      const supabase = await supabaseServer();

      // Fetch activities from Garmin
      const activities = await this.client.getActivities(startDate, endDate, 50);

      if (activities.length === 0) {
        console.log(`No activities found between ${startDate} and ${endDate}`);
        return 0;
      }

      // Fetch planned workouts for matching
      const { data: plannedWorkouts } = await supabase
        .from('planned_workouts')
        .select('id, scheduled_date, workout_type, day_label, status')
        .eq('user_id', this.userId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate);

      const plannedForMatch: PlannedWorkoutForMatch[] = (plannedWorkouts || []).map(pw => ({
        id: pw.id,
        scheduled_date: pw.scheduled_date,
        workout_type: pw.workout_type,
        day_label: pw.day_label,
        status: pw.status,
      }));

      let syncedCount = 0;

      for (const activity of activities) {
        try {
          // Check for duplicate
          const { data: existing } = await supabase
            .from('workout_logs')
            .select('id')
            .eq('garmin_activity_id', activity.activityId.toString())
            .maybeSingle();

          if (existing) {
            console.log(`⊘ Activity ${activity.activityId} already synced, skipping`);
            continue;
          }

          // Map activity type
          const mapped = mapGarminActivityType(activity.activityType.typeKey);
          if (!mapped) {
            console.log(`⊘ Unknown activity type: ${activity.activityType.typeKey}, skipping`);
            continue;
          }

          // Get detailed data for cardio activities
          let detail = null;
          let hrZones = null;
          if (mapped.workout_type === 'cardio' || mapped.workout_type === 'hiit') {
            detail = await this.client.getActivityDetails(activity.activityId);
            hrZones = await this.client.getActivityHRZones(activity.activityId);
          }

          // Transform to GarminActivity format for matching
          const garminActivity: GarminActivity = {
            activity_id: activity.activityId.toString(),
            activity_type: activity.activityType.typeKey,
            start_time: activity.startTimeLocal,
            duration_seconds: activity.duration,
            avg_hr: activity.averageHR,
            max_hr: activity.maxHR,
            min_hr: null,
            calories: activity.calories,
            distance_meters: activity.distance,
            avg_speed_mps: detail?.averageSpeed ?? null,
            avg_power_watts: detail?.averagePower ?? null,
            max_power_watts: detail?.maxPower ?? null,
            normalized_power: detail?.normalizedPower ?? null,
            hr_zones_minutes: this.transformHRZones(hrZones),
            training_effect_aerobic: detail?.trainingEffect ?? null,
            training_effect_anaerobic: detail?.anaerobicTrainingEffect ?? null,
            vo2_max: null,
            raw_data: { activity, detail, hrZones },
          };

          // Match to planned workout
          const match = matchActivityToPlannedWorkout(garminActivity, plannedForMatch);

          // Insert workout_log
          const workoutPayload: Record<string, any> = {
            user_id: this.userId,
            workout_date: activity.startTimeLocal.slice(0, 10),
            workout_type: mapped.workout_type,
            duration_minutes: Math.round(activity.duration / 60),
            garmin_activity_id: activity.activityId.toString(),
            planned_workout_id: match.planned_workout_id,
            source: 'garmin',
            avg_hr: activity.averageHR,
            max_hr: activity.maxHR,
            garmin_data: {
              activity_name: activity.activityName,
              match_confidence: match.confidence,
              match_reason: match.reason,
              ...garminActivity.raw_data,
            },
          };

          const { data: workout, error: workoutError } = await supabase
            .from('workout_logs')
            .insert(workoutPayload)
            .select('id')
            .single();

          if (workoutError) {
            throw new Error(`Failed to insert workout_log: ${workoutError.message}`);
          }

          // Insert cardio_log if applicable
          if ((mapped.workout_type === 'cardio' || mapped.workout_type === 'hiit') && detail) {
            const cardioData = garminActivityToCardioLog(garminActivity);

            const cardioPayload = {
              workout_log_id: workout.id,
              user_id: this.userId,
              ...cardioData,
            };

            const { error: cardioError } = await supabase
              .from('cardio_logs')
              .insert(cardioPayload);

            if (cardioError) {
              console.error(`Failed to insert cardio_log: ${cardioError.message}`);
            }
          }

          console.log(`✓ Synced activity ${activity.activityId} (${mapped.workout_type})`);
          syncedCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`✗ Failed to sync activity ${activity.activityId}: ${message}`);
        }
      }

      return syncedCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to sync activities: ${message}`);
    }
  }

  /**
   * Transform Garmin HR zone data (5 zones) to our 4-zone system.
   */
  private transformHRZones(hrZones: Awaited<ReturnType<typeof this.client.getActivityHRZones>>): { z1: number; z2: number; z3: number; z4: number; z5: number } | null {
    if (!hrZones || hrZones.zones.length === 0) return null;

    const zoneMap: Record<number, number> = {};
    for (const zone of hrZones.zones) {
      zoneMap[zone.zoneNumber] = Math.round(zone.secsInZone / 60); // Convert to minutes
    }

    return {
      z1: zoneMap[1] || 0,
      z2: zoneMap[2] || 0,
      z3: zoneMap[3] || 0,
      z4: zoneMap[4] || 0,
      z5: zoneMap[5] || 0,
    };
  }

  /**
   * Sync all data (metrics + activities) for the last N days.
   */
  async syncAll(days = 7): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      metricsCount: 0,
      activitiesCount: 0,
      errors: [],
    };

    try {
      const today = new Date();
      const dates: string[] = [];

      // Generate date list
      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().slice(0, 10));
      }

      // Sync daily metrics
      for (const date of dates) {
        try {
          await this.syncDailyMetrics(date);
          result.metricsCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Metrics ${date}: ${message}`);
        }
      }

      // Sync activities
      const startDate = dates[dates.length - 1];
      const endDate = dates[0];

      try {
        result.activitiesCount = await this.syncActivities(startDate, endDate);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Activities: ${message}`);
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }
}
