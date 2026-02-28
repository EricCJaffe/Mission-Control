import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

export interface GarminImportOptions {
  activities?: boolean;
  sleep?: boolean;
  biometrics?: boolean;
  trainingReadiness?: boolean;
  trainingLoad?: boolean;
  wellness?: boolean;
}

export interface GarminImportResults {
  activities: { imported: number; skipped: number; errors: number };
  sleep: { imported: number; skipped: number; errors: number };
  biometrics: { imported: number; skipped: number; errors: number };
  trainingReadiness: { imported: number; skipped: number; errors: number };
  trainingLoad: { imported: number; skipped: number; errors: number };
  wellness: { imported: number; skipped: number; errors: number };
  errors: string[];
}

export class GarminImporter {
  private supabase: SupabaseClient;
  private userId: string;
  private options: GarminImportOptions;

  constructor(supabase: SupabaseClient, userId: string, options: GarminImportOptions) {
    this.supabase = supabase;
    this.userId = userId;
    this.options = options;
  }

  async import(exportPath: string): Promise<GarminImportResults> {
    const results: GarminImportResults = {
      activities: { imported: 0, skipped: 0, errors: 0 },
      sleep: { imported: 0, skipped: 0, errors: 0 },
      biometrics: { imported: 0, skipped: 0, errors: 0 },
      trainingReadiness: { imported: 0, skipped: 0, errors: 0 },
      trainingLoad: { imported: 0, skipped: 0, errors: 0 },
      wellness: { imported: 0, skipped: 0, errors: 0 },
      errors: [],
    };

    const fitnessPath = path.join(exportPath, 'DI_CONNECT', 'DI-Connect-Fitness');
    const wellnessPath = path.join(exportPath, 'DI_CONNECT', 'DI-Connect-Wellness');
    const metricsPath = path.join(exportPath, 'DI_CONNECT', 'DI-Connect-Metrics');

    try {
      if (this.options.activities) {
        results.activities = await this.importActivities(fitnessPath);
      }

      if (this.options.sleep) {
        results.sleep = await this.importSleep(wellnessPath);
      }

      if (this.options.biometrics) {
        results.biometrics = await this.importBiometrics(wellnessPath);
      }

      if (this.options.trainingReadiness) {
        results.trainingReadiness = await this.importTrainingReadiness(metricsPath);
        console.log('[Garmin Import] Training Readiness results:', results.trainingReadiness);
      }

      if (this.options.trainingLoad) {
        results.trainingLoad = await this.importTrainingLoad(metricsPath);
        console.log('[Garmin Import] Training Load results:', results.trainingLoad);
      }

      if (this.options.wellness) {
        results.wellness = await this.importWellness(wellnessPath);
        console.log('[Garmin Import] Wellness results:', results.wellness);
      }
    } catch (error: any) {
      results.errors.push(`Import error: ${error.message}`);
    }

    return results;
  }

  private async importActivities(fitnessPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      // Find the summarizedActivities file
      const files = await fs.readdir(fitnessPath);
      const activitiesFile = files.find(f => f.includes('summarizedActivities'));

      if (!activitiesFile) {
        console.log('[Garmin Import] No summarizedActivities file found');
        return result;
      }

      const filePath = path.join(fitnessPath, activitiesFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // The JSON is an array with one object containing summarizedActivitiesExport
      const activities = (Array.isArray(data) && data[0]?.summarizedActivitiesExport) || data.summarizedActivitiesExport || [];
      console.log(`[Garmin Import] Found ${activities.length} activities to process`);

      for (const activity of activities) {
        try {
          // Map activity type to our workout types
          const workoutType = this.mapActivityType(activity.sportType || activity.activityType);

          // Parse start time (Garmin uses milliseconds since epoch in scientific notation)
          const startTimeMs = activity.startTimeGmt || activity.startTimeLocal || activity.beginTimestamp;
          if (!startTimeMs) {
            console.log('[Garmin Import] No start time for activity:', activity.activityId);
            result.skipped++;
            continue;
          }
          const workoutDate = new Date(startTimeMs);

          // Calculate duration in minutes
          const durationMinutes = activity.duration ? Math.round(activity.duration / 60000) : null;

          // Calculate TSS from training load (Garmin's activityTrainingLoad is similar to TSS)
          const tss = activity.activityTrainingLoad || null;

          // Check if already imported
          const { data: existing } = await this.supabase
            .from('workout_logs')
            .select('id')
            .eq('user_id', this.userId)
            .eq('external_id', `garmin_${activity.activityId}`)
            .maybeSingle();

          if (existing) {
            result.skipped++;
            continue;
          }

          // Insert workout
          const { data: workoutData, error: workoutError } = await this.supabase
            .from('workout_logs')
            .insert({
              user_id: this.userId,
              workout_date: workoutDate.toISOString(),
              duration_minutes: durationMinutes,
              workout_type: workoutType,
              tss: tss,
              notes: activity.name || activity.locationName || null,
              external_id: `garmin_${activity.activityId}`,
              import_source: 'Garmin',
            })
            .select('id')
            .single();

          if (workoutError) {
            console.error('[Garmin Import] Activity insert error:', workoutError.message, activity.activityId);
            result.errors++;
            continue;
          }

          // If it's a cardio activity, also add to cardio_logs
          if (workoutData && ['running', 'cycling', 'swimming'].includes(workoutType.toLowerCase())) {
            await this.supabase.from('cardio_logs').insert({
              workout_log_id: workoutData.id,
              activity_type: workoutType,
              distance_miles: activity.distance ? parseFloat((activity.distance / 160934).toFixed(2)) : null, // centimeters to miles
              avg_hr: activity.avgHr || null,
              max_hr: activity.maxHr || null,
              min_hr: activity.minHr || null,
              calories: activity.calories ? Math.round(activity.calories) : null,
              avg_power_watts: activity.avgPower || null,
              max_power_watts: activity.maxPower || null,
              normalized_power: activity.normPower || null,
            });
          }

          result.imported++;
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private async importSleep(wellnessPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      // Find all sleep data files (multiple date-ranged files)
      const files = await fs.readdir(wellnessPath);
      const sleepFiles = files.filter(f => f.includes('sleepData.json'));

      for (const sleepFile of sleepFiles) {
        try {
          const filePath = path.join(wellnessPath, sleepFile);
          const content = await fs.readFile(filePath, 'utf-8');
          const sleepData = JSON.parse(content);

          if (!Array.isArray(sleepData) || sleepData.length === 0) {
            continue;
          }

          for (const sleep of sleepData) {
            // Skip empty/retro records
            if (sleep.retro === true || !sleep.calendarDate) {
              result.skipped++;
              continue;
            }

            try {
              const sleepDate = sleep.calendarDate;
              // Parse timestamps - Garmin format is "2025-11-22T03:11:30.0" which needs to be converted
              const sleepStartStr = sleep.sleepStartTimestampGMT?.replace('.0', '.000Z') || '';
              const sleepEndStr = sleep.sleepEndTimestampGMT?.replace('.0', '.000Z') || '';
              const sleepStart = new Date(sleepStartStr);
              const sleepEnd = new Date(sleepEndStr);

              // Validate dates
              if (isNaN(sleepStart.getTime()) || isNaN(sleepEnd.getTime())) {
                console.error('[Garmin Import] Invalid sleep dates:', sleepDate, sleep.sleepStartTimestampGMT, sleep.sleepEndTimestampGMT);
                result.errors++;
                continue;
              }

              const totalSleep =
                (sleep.deepSleepSeconds || 0) +
                (sleep.lightSleepSeconds || 0) +
                (sleep.remSleepSeconds || 0);

              // Use smart UPSERT
              const { error } = await this.supabase
                .from('sleep_logs')
                .upsert(
                  {
                    user_id: this.userId,
                    sleep_date: sleepDate,
                    sleep_start: sleepStart.toISOString(),
                    sleep_end: sleepEnd.toISOString(),
                    total_sleep_seconds: totalSleep,
                    deep_sleep_seconds: sleep.deepSleepSeconds || null,
                    light_sleep_seconds: sleep.lightSleepSeconds || null,
                    rem_sleep_seconds: sleep.remSleepSeconds || null,
                    awake_seconds: sleep.awakeSleepSeconds || null,
                    sleep_score: sleep.sleepScores?.overallScore || null,
                    avg_respiration: sleep.averageRespiration || null,
                    avg_stress: sleep.avgSleepStress || null,
                    wake_up_count: sleep.awakeCount || null,
                    avg_hr: sleep.averageHeartRate || null,
                    source: 'Garmin',
                  },
                  {
                    onConflict: 'user_id,sleep_date',
                    ignoreDuplicates: false,
                  }
                );

              if (error) {
                console.error('[Garmin Import] Sleep insert error:', error.message, sleepDate);
                result.errors++;
              } else {
                result.imported++;
              }
            } catch (error: any) {
              console.error('[Garmin Import] Sleep processing error:', error.message);
              result.errors++;
            }
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private async importBiometrics(wellnessPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      // Find biometrics file
      const files = await fs.readdir(wellnessPath);
      const bioFile = files.find(f => f.includes('userBioMetrics.json'));

      if (!bioFile) {
        return result;
      }

      const filePath = path.join(wellnessPath, bioFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const bioData = JSON.parse(content);

      if (!Array.isArray(bioData)) {
        return result;
      }

      for (const bio of bioData) {
        if (!bio.metaData?.calendarDate || !bio.weight?.weight) {
          result.skipped++;
          continue;
        }

        try {
          const metricDate = bio.metaData.calendarDate.split('T')[0]; // Extract date only
          const weightGrams = bio.weight.weight;
          const weightLbs = weightGrams / 453.592; // grams to lbs

          // Check if record already exists (don't overwrite Withings body composition data)
          const { data: existing } = await this.supabase
            .from('body_metrics')
            .select('id')
            .eq('user_id', this.userId)
            .eq('metric_date', metricDate)
            .maybeSingle();

          if (existing) {
            result.skipped++;
            continue;
          }

          // Only insert if doesn't exist
          const { error } = await this.supabase
            .from('body_metrics')
            .insert({
              user_id: this.userId,
              metric_date: metricDate,
              weight_lbs: parseFloat(weightLbs.toFixed(1)),
              weight_source: 'Garmin',
            });

          if (error) {
            result.errors++;
          } else {
            result.imported++;
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private async importTrainingReadiness(metricsPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      console.log('[Garmin Import] Training Readiness - Checking path:', metricsPath);
      const files = await fs.readdir(metricsPath);
      const readinessFiles = files.filter(f => f.includes('TrainingReadinessDTO'));
      console.log('[Garmin Import] Found', readinessFiles.length, 'readiness files');

      for (const file of readinessFiles) {
        try {
          const filePath = path.join(metricsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          if (!Array.isArray(data)) continue;

          for (const reading of data) {
            if (!reading.calendarDate || !reading.score) {
              result.skipped++;
              continue;
            }

            try {
              const calcDate = reading.calendarDate;
              const score = reading.score;

              // Map level to color
              const level = reading.level || 'UNKNOWN';
              let color = 'yellow';
              if (level === 'HIGH' || level === 'VERY_HIGH') color = 'green';
              else if (level === 'LOW' || level === 'VERY_LOW') color = 'red';

              // Use smart UPSERT
              const { error } = await this.supabase
                .from('daily_readiness')
                .upsert(
                  {
                    user_id: this.userId,
                    calc_date: calcDate,
                    readiness_score: score,
                    readiness_color: color,
                    readiness_label: level,
                    hrv_score: reading.hrvFactorPercent || null,
                    sleep_score: reading.sleepScoreFactorPercent || null,
                    recommendation: reading.feedbackLong || null,
                    inputs: reading,
                  },
                  {
                    onConflict: 'user_id,calc_date',
                    ignoreDuplicates: false,
                  }
                );

              if (error) {
                console.error('[Garmin Import] Training readiness error:', error.message, calcDate);
                result.errors++;
              } else {
                result.imported++;
              }
            } catch (error: any) {
              result.errors++;
            }
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private async importTrainingLoad(metricsPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      console.log('[Garmin Import] Training Load - Checking path:', metricsPath);
      const files = await fs.readdir(metricsPath);
      const loadFiles = files.filter(f => f.includes('MetricsAcuteTrainingLoad'));
      console.log('[Garmin Import] Found', loadFiles.length, 'training load files');

      for (const file of loadFiles) {
        try {
          const filePath = path.join(metricsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          if (!Array.isArray(data)) continue;

          for (const reading of data) {
            if (!reading.calendarDate) {
              result.skipped++;
              continue;
            }

            try {
              // Convert timestamp to date
              const calcDate = new Date(reading.calendarDate).toISOString().split('T')[0];

              const atl = reading.dailyTrainingLoadAcute || 0;
              const ctl = reading.dailyTrainingLoadChronic || 0;
              const tsb = ctl - atl; // Form/TSB = Fitness - Fatigue

              // Use smart UPSERT
              const { error } = await this.supabase
                .from('fitness_form')
                .upsert(
                  {
                    user_id: this.userId,
                    calc_date: calcDate,
                    fatigue_atl: atl,
                    fitness_ctl: ctl,
                    form_tsb: tsb,
                    form_status: reading.acwrStatus || null,
                  },
                  {
                    onConflict: 'user_id,calc_date',
                    ignoreDuplicates: false,
                  }
                );

              if (error) {
                console.error('[Garmin Import] Training load error:', error.message, calcDate);
                result.errors++;
              } else {
                result.imported++;
              }
            } catch (error: any) {
              result.errors++;
            }
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private async importWellness(wellnessPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const result = { imported: 0, skipped: 0, errors: 0 };

    try {
      console.log('[Garmin Import] Wellness - Checking path:', wellnessPath);
      const files = await fs.readdir(wellnessPath);
      const healthFiles = files.filter(f => f.includes('healthStatusData'));
      console.log('[Garmin Import] Found', healthFiles.length, 'health status files');

      for (const file of healthFiles) {
        try {
          const filePath = path.join(wellnessPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);

          if (!Array.isArray(data)) continue;

          for (const reading of data) {
            if (!reading.calendarDate) {
              result.skipped++;
              continue;
            }

            try {
              const metricDate = reading.calendarDate;

              // Extract metrics from the metrics array
              let hrvValue = null;
              let rhrValue = null;

              if (reading.metrics && Array.isArray(reading.metrics)) {
                const hrvMetric = reading.metrics.find((m: any) => m.type === 'HRV');
                const hrMetric = reading.metrics.find((m: any) => m.type === 'HR');

                hrvValue = hrvMetric?.value || null;
                rhrValue = hrMetric?.value || null;

                console.log('[Garmin Import] Wellness data for', metricDate, '- HRV:', hrvValue, 'RHR:', rhrValue);
              }

              // Check if record exists
              const { data: existing } = await this.supabase
                .from('body_metrics')
                .select('id, resting_hr, hrv_ms')
                .eq('user_id', this.userId)
                .eq('metric_date', metricDate)
                .maybeSingle();

              if (existing) {
                // Only update if current values are null
                const updates: any = {};
                if (existing.resting_hr === null && rhrValue !== null) {
                  updates.resting_hr = Math.round(rhrValue);
                }
                if (existing.hrv_ms === null && hrvValue !== null) {
                  updates.hrv_ms = Math.round(hrvValue);
                }

                console.log('[Garmin Import] Existing record for', metricDate, '- Current RHR:', existing.resting_hr, 'Current HRV:', existing.hrv_ms, 'Updates:', updates);

                if (Object.keys(updates).length > 0) {
                  const { error } = await this.supabase
                    .from('body_metrics')
                    .update(updates)
                    .eq('id', existing.id);

                  if (!error) {
                    console.log('[Garmin Import] Updated wellness data for', metricDate);
                    result.imported++;
                  } else {
                    console.error('[Garmin Import] Failed to update:', error.message);
                    result.errors++;
                  }
                } else {
                  result.skipped++;
                }
              } else {
                // Insert new record
                const { error } = await this.supabase
                  .from('body_metrics')
                  .insert({
                    user_id: this.userId,
                    metric_date: metricDate,
                    resting_hr: rhrValue ? Math.round(rhrValue) : null,
                    hrv_ms: hrvValue ? Math.round(hrvValue) : null,
                    garmin_data: reading,
                  });

                if (error) {
                  console.error('[Garmin Import] Wellness error:', error.message, metricDate);
                  result.errors++;
                } else {
                  result.imported++;
                }
              }
            } catch (error: any) {
              result.errors++;
            }
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    } catch (error: any) {
      result.errors++;
    }

    return result;
  }

  private mapActivityType(garminType: string): string {
    const typeMap: Record<string, string> = {
      'RUNNING': 'Running',
      'CYCLING': 'Cycling',
      'ROAD_BIKING': 'Cycling',
      'MOUNTAIN_BIKING': 'Cycling',
      'SWIMMING': 'Swimming',
      'POOL_SWIMMING': 'Swimming',
      'OPEN_WATER_SWIMMING': 'Swimming',
      'STRENGTH_TRAINING': 'Strength',
      'CARDIO_TRAINING': 'Cardio',
      'WALKING': 'Walking',
      'HIKING': 'Hiking',
      'YOGA': 'Yoga',
      'OTHER': 'Other',
    };

    return typeMap[garminType?.toUpperCase()] || 'Other';
  }
}
