/**
 * Workout Pattern Detector for Health.md Auto-Updater
 *
 * Analyzes workout patterns to detect:
 * - Training load spikes (TSS significantly above normal)
 * - Exercise intolerance (incomplete workouts, early termination)
 * - Cardiac anomalies (HR patterns outside expected zones)
 */

import { createClient } from '@supabase/supabase-js';

export type WorkoutPattern = {
  pattern_type: 'training_load_spike' | 'exercise_intolerance' | 'cardiac_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  data: any;
};

export class WorkoutTriggerDetector {
  private supabase;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.supabase = createClient(url, key);
  }

  /**
   * Analyze a workout for concerning patterns
   */
  async analyzeWorkout(params: {
    userId: string;
    workoutId: string;
    workoutType: string;
    durationMin: number | null;
    tss: number | null;
    strainScore: number | null;
    avgHr: number | null;
    maxHr: number | null;
    rpeSession: number | null;
    compliancePct: number | null;
  }): Promise<WorkoutPattern[]> {
    const patterns: WorkoutPattern[] = [];

    // Detect training load spike
    const loadSpike = await this.detectTrainingLoadSpike(
      params.userId,
      params.tss,
      params.strainScore
    );
    if (loadSpike) patterns.push(loadSpike);

    // Detect exercise intolerance
    const intolerance = await this.detectExerciseIntolerance(
      params.userId,
      params.durationMin,
      params.compliancePct,
      params.rpeSession
    );
    if (intolerance) patterns.push(intolerance);

    // Detect cardiac anomalies
    const cardiacAnomaly = await this.detectCardiacAnomaly(
      params.userId,
      params.avgHr,
      params.maxHr,
      params.workoutType
    );
    if (cardiacAnomaly) patterns.push(cardiacAnomaly);

    return patterns;
  }

  /**
   * Detect training load spike (TSS >150% of 7-day average)
   */
  private async detectTrainingLoadSpike(
    userId: string,
    tss: number | null,
    strainScore: number | null
  ): Promise<WorkoutPattern | null> {
    if (!tss && !strainScore) return null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get 7-day average TSS
    const { data: recentWorkouts } = await this.supabase
      .from('workout_logs')
      .select('tss, strain_score')
      .eq('user_id', userId)
      .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0])
      .not('tss', 'is', null);

    if (!recentWorkouts || recentWorkouts.length === 0) return null;

    const avgTss = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0) / recentWorkouts.length;
    const avgStrain = recentWorkouts.reduce((sum, w) => sum + (w.strain_score || 0), 0) / recentWorkouts.length;

    const currentTss = tss || 0;
    const currentStrain = strainScore || 0;

    // Check if current TSS or strain is >150% of average
    const tssRatio = avgTss > 0 ? currentTss / avgTss : 1;
    const strainRatio = avgStrain > 0 ? currentStrain / avgStrain : 1;

    if (tssRatio > 1.5 || strainRatio > 1.5) {
      return {
        pattern_type: 'training_load_spike',
        severity: tssRatio > 2.0 || strainRatio > 2.0 ? 'high' : 'medium',
        description: `Training load spike detected: ${Math.round(Math.max(tssRatio, strainRatio) * 100)}% of 7-day average`,
        data: {
          current_tss: currentTss,
          avg_tss: Math.round(avgTss),
          tss_ratio: Math.round(tssRatio * 100) / 100,
          current_strain: currentStrain,
          avg_strain: Math.round(avgStrain),
          strain_ratio: Math.round(strainRatio * 100) / 100,
        },
      };
    }

    return null;
  }

  /**
   * Detect exercise intolerance (3+ incomplete workouts in past 7 days, or very low compliance/high RPE)
   */
  private async detectExerciseIntolerance(
    userId: string,
    durationMin: number | null,
    compliancePct: number | null,
    rpeSession: number | null
  ): Promise<WorkoutPattern | null> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Check for pattern of incomplete workouts (low compliance)
    const { data: recentWorkouts } = await this.supabase
      .from('workout_logs')
      .select('compliance_pct, rpe_session, duration_minutes')
      .eq('user_id', userId)
      .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0]);

    if (!recentWorkouts || recentWorkouts.length === 0) return null;

    const incompleteWorkouts = recentWorkouts.filter(
      (w) => w.compliance_pct !== null && w.compliance_pct < 70
    );

    // Current workout has low compliance and high RPE (suggesting intolerance)
    const currentIntolerance =
      compliancePct !== null &&
      compliancePct < 70 &&
      rpeSession !== null &&
      rpeSession >= 9;

    // Pattern: 3+ incomplete workouts in past week
    if (incompleteWorkouts.length >= 3 || currentIntolerance) {
      return {
        pattern_type: 'exercise_intolerance',
        severity: incompleteWorkouts.length >= 4 || rpeSession === 10 ? 'high' : 'medium',
        description: `Exercise intolerance pattern: ${incompleteWorkouts.length} incomplete workouts in past 7 days`,
        data: {
          incomplete_count: incompleteWorkouts.length,
          current_compliance: compliancePct,
          current_rpe: rpeSession,
          avg_compliance: Math.round(
            recentWorkouts.reduce((sum, w) => sum + (w.compliance_pct || 100), 0) /
              recentWorkouts.length
          ),
        },
      };
    }

    return null;
  }

  /**
   * Detect cardiac anomalies (HR >20% above expected zones or max HR >155)
   */
  private async detectCardiacAnomaly(
    userId: string,
    avgHr: number | null,
    maxHr: number | null,
    workoutType: string
  ): Promise<WorkoutPattern | null> {
    if (!avgHr && !maxHr) return null;

    // Get user's latest resting HR for context
    const { data: latestMetrics } = await this.supabase
      .from('body_metrics')
      .select('resting_hr')
      .eq('user_id', userId)
      .not('resting_hr', 'is', null)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const restingHr = latestMetrics?.resting_hr || 60;

    // Check for concerning HR patterns
    const concerns: string[] = [];

    // Max HR exceeds ceiling
    if (maxHr && maxHr > 155) {
      concerns.push(`Max HR ${maxHr} bpm exceeds 155 bpm ceiling`);
    }

    // Average HR unusually high for workout type
    if (avgHr) {
      const expectedMaxAvg: Record<string, number> = {
        strength: 120,
        cardio: 145,
        hiit: 150,
        hybrid: 135,
      };

      const expected = expectedMaxAvg[workoutType] || 140;
      if (avgHr > expected * 1.2) {
        concerns.push(`Avg HR ${avgHr} bpm is ${Math.round((avgHr / expected - 1) * 100)}% above expected for ${workoutType}`);
      }
    }

    // HR reserve usage (if resting HR available)
    if (avgHr && restingHr) {
      const maxExpected = 220 - 50; // Assuming age 50 (could be parameterized)
      const hrReserve = maxExpected - restingHr;
      const hrReserveUsed = avgHr - restingHr;
      const pctReserve = (hrReserveUsed / hrReserve) * 100;

      if (pctReserve > 80 && workoutType === 'strength') {
        concerns.push(`Using ${Math.round(pctReserve)}% of HR reserve during strength training`);
      }
    }

    if (concerns.length > 0) {
      return {
        pattern_type: 'cardiac_anomaly',
        severity: maxHr && maxHr > 165 ? 'high' : maxHr && maxHr > 155 ? 'medium' : 'low',
        description: concerns.join('; '),
        data: {
          avg_hr: avgHr,
          max_hr: maxHr,
          resting_hr: restingHr,
          workout_type: workoutType,
        },
      };
    }

    return null;
  }
}
