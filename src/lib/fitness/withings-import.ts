/**
 * Withings Health Mate Data Importer
 *
 * Imports historical data from Withings export (CSV format):
 * - Blood pressure readings (bp.csv)
 * - Body composition (weight.csv)
 * - Activities/workouts (activities.csv)
 * - Daily aggregates (aggregates_*.csv)
 * - Sleep data (sleep.csv)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import * as fs from 'fs';
import * as path from 'path';

export type ImportProgress = {
  category: string;
  current: number;
  total: number;
  status: 'processing' | 'complete' | 'error';
  message?: string;
  errors?: string[];
};

export type ImportResults = {
  bp: { imported: number; skipped: number; errors: number };
  weight: { imported: number; skipped: number; errors: number };
  activities: { imported: number; skipped: number; errors: number };
  dailyAggregates: { imported: number; skipped: number; errors: number };
  sleep: { imported: number; skipped: number; errors: number };
};

export class WithingsImporter {
  private supabase: SupabaseClient;
  private userId: string;
  private progressCallback?: (progress: ImportProgress) => void;

  constructor(
    userId: string,
    supabaseUrl?: string,
    supabaseKey?: string,
    progressCallback?: (progress: ImportProgress) => void
  ) {
    this.supabase = createClient(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.userId = userId;
    this.progressCallback = progressCallback;
  }

  /**
   * Import all Withings data from export directory
   */
  async importAll(exportPath: string): Promise<ImportResults> {
    const results: ImportResults = {
      bp: { imported: 0, skipped: 0, errors: 0 },
      weight: { imported: 0, skipped: 0, errors: 0 },
      activities: { imported: 0, skipped: 0, errors: 0 },
      dailyAggregates: { imported: 0, skipped: 0, errors: 0 },
      sleep: { imported: 0, skipped: 0, errors: 0 },
    };

    // Import in priority order
    // Note: Skipping activities - using Garmin as workout source of truth
    results.bp = await this.importBloodPressure(path.join(exportPath, 'bp.csv'));
    results.weight = await this.importBodyMetrics(path.join(exportPath, 'weight.csv'));
    results.dailyAggregates = await this.importDailyAggregates(exportPath);
    // results.activities = await this.importActivities(path.join(exportPath, 'activities.csv')); // DISABLED
    results.sleep = await this.importSleep(path.join(exportPath, 'sleep.csv'));

    return results;
  }

  /**
   * Import blood pressure readings from bp.csv
   */
  async importBloodPressure(csvPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Blood Pressure', 0, 0, 'error', 'bp.csv not found');
      return stats;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const { data, errors: parseErrors } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseErrors.length > 0) {
      this.updateProgress('Blood Pressure', 0, 0, 'error', `Parse errors: ${parseErrors.length}`);
      stats.errors = parseErrors.length;
      return stats;
    }

    const rows = data as any[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Blood Pressure', i + 1, total, 'processing');

      // Skip if no systolic/diastolic (HR-only measurement)
      if (!row.Systolic || !row.Diastolic) {
        stats.skipped++;
        continue;
      }

      try {
        const measured_at = new Date(row.Date);

        // Check for existing reading within ±2 minutes (deduplication)
        const twoMinsBefore = new Date(measured_at.getTime() - 2 * 60 * 1000);
        const twoMinsAfter = new Date(measured_at.getTime() + 2 * 60 * 1000);

        const { data: existing } = await this.supabase
          .from('bp_readings')
          .select('id')
          .eq('user_id', this.userId)
          .gte('reading_date', twoMinsBefore.toISOString())
          .lte('reading_date', twoMinsAfter.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          stats.skipped++;
          continue;
        }

        // Insert new reading (deduplication handled above)
        const { error } = await this.supabase.from('bp_readings').insert({
          user_id: this.userId,
          reading_date: measured_at.toISOString(),
          systolic: parseInt(row.Systolic),
          diastolic: parseInt(row.Diastolic),
          pulse: row['Heart rate'] ? parseInt(row['Heart rate']) : null,
          source: 'Withings',
          notes: row.Comments || 'Imported from Withings Health Mate',
        });

        if (error) {
          console.error('BP insert error:', error);
          stats.errors++;
        } else {
          stats.imported++;
        }
      } catch (err) {
        console.error('BP processing error:', err);
        stats.errors++;
      }
    }

    this.updateProgress('Blood Pressure', total, total, 'complete', `Imported ${stats.imported}, skipped ${stats.skipped}`);
    return stats;
  }

  /**
   * Import body composition from weight.csv
   */
  async importBodyMetrics(csvPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Body Metrics', 0, 0, 'error', 'weight.csv not found');
      return stats;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const { data, errors: parseErrors } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseErrors.length > 0) {
      this.updateProgress('Body Metrics', 0, 0, 'error', `Parse errors: ${parseErrors.length}`);
      stats.errors = parseErrors.length;
      return stats;
    }

    const rows = data as any[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Body Metrics', i + 1, total, 'processing');

      if (!row['Weight (lb)']) {
        stats.skipped++;
        continue;
      }

      try {
        const measured_at = new Date(row.Date);
        const metric_date = measured_at.toISOString().split('T')[0]; // Extract date only
        const weight_lbs = parseFloat(row['Weight (lb)']);

        const fat_mass_lbs = row['Fat mass (lb)'] ? parseFloat(row['Fat mass (lb)']) : null;
        const muscle_mass_lbs = row['Muscle mass (lb)'] ? parseFloat(row['Muscle mass (lb)']) : null;
        const bone_mass_lbs = row['Bone mass (lb)'] ? parseFloat(row['Bone mass (lb)']) : null;
        const hydration_lbs = row['Hydration (lb)'] ? parseFloat(row['Hydration (lb)']) : null;

        // Calculate body fat % if we have fat mass
        const body_fat_pct = fat_mass_lbs ? ((fat_mass_lbs / weight_lbs) * 100) : null;

        // Smart upsert: merge Withings data with existing (unique constraint on user_id, metric_date)
        const { error } = await this.supabase.from('body_metrics').upsert(
          {
            user_id: this.userId,
            metric_date: metric_date,
            weight_lbs: weight_lbs,
            body_fat_pct: body_fat_pct ? parseFloat(body_fat_pct.toFixed(1)) : null,
            muscle_mass_lbs: muscle_mass_lbs,
            bone_mass_lbs: bone_mass_lbs,
            hydration_lbs: hydration_lbs,
            weight_source: 'Withings',
            notes: row.Comments || null,
          },
          {
            onConflict: 'user_id,metric_date',
            ignoreDuplicates: false,
          }
        );

        if (error) {
          console.error('Body metrics upsert error:', error);
          stats.errors++;
        } else {
          stats.imported++;
        }
      } catch (err) {
        console.error('Body metrics processing error:', err);
        stats.errors++;
      }
    }

    this.updateProgress('Body Metrics', total, total, 'complete', `Imported ${stats.imported}, skipped ${stats.skipped}`);
    return stats;
  }

  /**
   * Import activities/workouts from activities.csv
   */
  async importActivities(csvPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Activities', 0, 0, 'error', 'activities.csv not found');
      return stats;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const { data, errors: parseErrors } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseErrors.length > 0) {
      this.updateProgress('Activities', 0, 0, 'error', `Parse errors: ${parseErrors.length}`);
      stats.errors = parseErrors.length;
      return stats;
    }

    const rows = data as any[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Activities', i + 1, total, 'processing');

      try {
        const start_time = new Date(row.from);
        const end_time = new Date(row.to);
        const activityType = row['Activity type'];

        // Parse JSON data field
        let activityData: any = {};
        try {
          activityData = JSON.parse(row.Data);
        } catch {
          stats.errors++;
          continue;
        }

        // Check for existing workout within ±5 minutes
        const fiveMinsBefore = new Date(start_time.getTime() - 5 * 60 * 1000);
        const fiveMinsAfter = new Date(start_time.getTime() + 5 * 60 * 1000);

        const { data: existing } = await this.supabase
          .from('workout_logs')
          .select('id')
          .eq('user_id', this.userId)
          .gte('workout_date', fiveMinsBefore.toISOString())
          .lte('workout_date', fiveMinsAfter.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          stats.skipped++;
          continue;
        }

        // Map activity type to workout type
        const workoutType = this.mapActivityType(activityType);
        const duration_seconds = activityData.effduration || Math.floor((end_time.getTime() - start_time.getTime()) / 1000);

        // Insert workout log
        const { data: workoutLog, error: workoutError } = await this.supabase
          .from('workout_logs')
          .insert({
            user_id: this.userId,
            workout_date: start_time.toISOString(),
            duration_minutes: Math.round(duration_seconds / 60),
            workout_type: workoutType,
            notes: activityType,
            external_id: `withings_${row.from}`,
            import_source: 'Withings',
          })
          .select('id')
          .single();

        if (workoutError) {
          console.error('Workout insert error:', workoutError);
          stats.errors++;
          continue;
        }

        // If cardio activity, insert cardio log
        if (workoutType === 'cardio' && activityData.distance) {
          const distance_miles = (activityData.distance || 0) / 1609.34; // meters to miles

          await this.supabase.from('cardio_logs').insert({
            workout_log_id: workoutLog.id,
            activity_type: this.mapCardioActivity(activityType),
            distance_miles: distance_miles,
            avg_hr: activityData.hr_average || null,
            max_hr: activityData.hr_max || null,
            min_hr: activityData.hr_min || null,
            avg_pace_per_mile: this.calculatePace(duration_seconds, distance_miles, activityType),
            calories: activityData.calories || null,
            hr_zone_0_seconds: activityData.hr_zone_0 || null,
            hr_zone_1_seconds: activityData.hr_zone_1 || null,
            hr_zone_2_seconds: activityData.hr_zone_2 || null,
            hr_zone_3_seconds: activityData.hr_zone_3 || null,
          });
        }

        stats.imported++;
      } catch (err) {
        console.error('Activity processing error:', err);
        stats.errors++;
      }
    }

    this.updateProgress('Activities', total, total, 'complete', `Imported ${stats.imported}, skipped ${stats.skipped}`);
    return stats;
  }

  /**
   * Import daily aggregates (steps, calories, distance)
   */
  async importDailyAggregates(exportPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    const aggregateFiles = [
      'aggregates_steps.csv',
      'aggregates_calories_earned.csv',
      'aggregates_calories_passive.csv',
      'aggregates_distance.csv',
      'aggregates_elevation.csv',
    ];

    const aggregatesData: Map<string, any> = new Map();

    // Parse all aggregate files
    for (const fileName of aggregateFiles) {
      const filePath = path.join(exportPath, fileName);
      if (!fs.existsSync(filePath)) continue;

      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

      const rows = data as any[];
      for (const row of rows) {
        if (!row.date) continue;

        const dateKey = row.date;
        if (!aggregatesData.has(dateKey)) {
          aggregatesData.set(dateKey, { date: dateKey });
        }

        const dayData = aggregatesData.get(dateKey);

        if (fileName.includes('steps')) {
          dayData.steps = parseInt(row.value || 0);
        } else if (fileName.includes('calories_earned')) {
          dayData.active_calories = parseInt(row.value || 0);
        } else if (fileName.includes('calories_passive')) {
          dayData.bmr_calories = parseInt(row.value || 0);
        } else if (fileName.includes('distance')) {
          dayData.distance_miles = parseFloat(row.value || 0) / 1609.34; // meters to miles
        } else if (fileName.includes('elevation')) {
          dayData.floors_climbed = parseInt(row.value || 0);
        }
      }
    }

    const total = aggregatesData.size;
    let current = 0;

    for (const [dateKey, dayData] of aggregatesData) {
      current++;
      this.updateProgress('Daily Aggregates', current, total, 'processing');

      try {
        const total_calories = (dayData.active_calories || 0) + (dayData.bmr_calories || 0);

        // Smart upsert: merge Withings data with existing (unique constraint on user_id, summary_date)
        const { error } = await this.supabase.from('daily_summaries').upsert(
          {
            user_id: this.userId,
            summary_date: dateKey,
            total_steps: dayData.steps || null,
            distance_miles: dayData.distance_miles || null,
            floors_climbed: dayData.floors_climbed || null,
            total_calories: total_calories > 0 ? total_calories : null,
            active_calories: dayData.active_calories || null,
            bmr_calories: dayData.bmr_calories || null,
            source: 'Withings',
          },
          {
            onConflict: 'user_id,summary_date',
            ignoreDuplicates: false,
          }
        );

        if (error) {
          console.error('Daily summary upsert error:', error);
          stats.errors++;
        } else {
          stats.imported++;
        }
      } catch (err) {
        console.error('Daily aggregate processing error:', err);
        stats.errors++;
      }
    }

    this.updateProgress('Daily Aggregates', total, total, 'complete', `Imported ${stats.imported}, skipped ${stats.skipped}`);
    return stats;
  }

  /**
   * Import sleep data from sleep.csv
   */
  async importSleep(csvPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Sleep', 0, 0, 'error', 'sleep.csv not found');
      return stats;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const { data, errors: parseErrors } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseErrors.length > 0) {
      this.updateProgress('Sleep', 0, 0, 'error', `Parse errors: ${parseErrors.length}`);
      stats.errors = parseErrors.length;
      return stats;
    }

    const rows = data as any[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Sleep', i + 1, total, 'processing');

      try {
        const sleep_start = new Date(row.from);
        const sleep_end = new Date(row.to);
        const sleep_date = sleep_start.toISOString().split('T')[0];

        const light_sleep_seconds = parseInt(row['light (s)'] || 0);
        const deep_sleep_seconds = parseInt(row['deep (s)'] || 0);
        const rem_sleep_seconds = parseInt(row['rem (s)'] || 0);
        const awake_seconds = parseInt(row['awake (s)'] || 0);

        const total_sleep_seconds = light_sleep_seconds + deep_sleep_seconds + rem_sleep_seconds;

        // Skip if no actual sleep data (all zeros)
        if (total_sleep_seconds === 0) {
          stats.skipped++;
          continue;
        }

        // Smart upsert: merge Withings data with existing (unique constraint on user_id, sleep_date)
        const { error } = await this.supabase.from('sleep_logs').upsert(
          {
            user_id: this.userId,
            sleep_date: sleep_date,
            sleep_start: sleep_start.toISOString(),
            sleep_end: sleep_end.toISOString(),
            total_sleep_seconds: total_sleep_seconds,
            light_sleep_seconds: light_sleep_seconds > 0 ? light_sleep_seconds : null,
            deep_sleep_seconds: deep_sleep_seconds > 0 ? deep_sleep_seconds : null,
            rem_sleep_seconds: rem_sleep_seconds > 0 ? rem_sleep_seconds : null,
            awake_seconds: awake_seconds > 0 ? awake_seconds : null,
            avg_hr: row['Average heart rate'] ? parseInt(row['Average heart rate']) : null,
            min_hr: row['Heart rate (min)'] ? parseInt(row['Heart rate (min)']) : null,
            max_hr: row['Heart rate (max)'] ? parseInt(row['Heart rate (max)']) : null,
            duration_to_sleep_seconds: row['Duration to sleep (s)'] ? parseInt(row['Duration to sleep (s)']) : null,
            duration_to_wake_seconds: row['Duration to wake up (s)'] ? parseInt(row['Duration to wake up (s)']) : null,
            wake_up_count: row['wake up'] ? parseInt(row['wake up']) : null,
            snoring_seconds: row['Snoring (s)'] ? parseInt(row['Snoring (s)']) : null,
            snoring_episodes: row['Snoring episodes'] ? parseInt(row['Snoring episodes']) : null,
            source: 'Withings',
          },
          {
            onConflict: 'user_id,sleep_date',
            ignoreDuplicates: false,
          }
        );

        if (error) {
          console.error('Sleep upsert error:', error);
          stats.errors++;
        } else {
          stats.imported++;
        }
      } catch (err) {
        console.error('Sleep processing error:', err);
        stats.errors++;
      }
    }

    this.updateProgress('Sleep', total, total, 'complete', `Imported ${stats.imported}, skipped ${stats.skipped}`);
    return stats;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private mapActivityType(withingsType: string): 'strength' | 'cardio' | 'hiit' | 'hybrid' | 'mobility' {
    const type = withingsType.toLowerCase();
    if (type.includes('running') || type.includes('walking') || type.includes('cycling') || type.includes('swimming')) {
      return 'cardio';
    }
    if (type.includes('weight') || type.includes('strength')) {
      return 'strength';
    }
    if (type.includes('hiit') || type.includes('interval')) {
      return 'hiit';
    }
    return 'cardio'; // Default
  }

  private mapCardioActivity(withingsType: string): string {
    const type = withingsType.toLowerCase();
    if (type.includes('running')) return 'Running';
    if (type.includes('walking')) return 'Walking';
    if (type.includes('cycling') || type.includes('biking')) return 'Biking';
    if (type.includes('swimming')) return 'Swimming';
    if (type.includes('rowing')) return 'Rowing';
    return 'Other';
  }

  private calculatePace(durationSeconds: number, distanceMiles: number, activityType: string): string | null {
    if (!distanceMiles || distanceMiles === 0) return null;
    if (!activityType.toLowerCase().includes('running') && !activityType.toLowerCase().includes('walking')) {
      return null;
    }

    const paceMinutesPerMile = durationSeconds / 60 / distanceMiles;
    const minutes = Math.floor(paceMinutesPerMile);
    const seconds = Math.round((paceMinutesPerMile - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private updateProgress(category: string, current: number, total: number, status: 'processing' | 'complete' | 'error', message?: string) {
    if (this.progressCallback) {
      this.progressCallback({
        category,
        current,
        total,
        status,
        message,
      });
    }
  }
}
