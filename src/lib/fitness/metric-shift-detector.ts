/**
 * Metric Shift Detector
 *
 * Monitors key health metrics for significant changes and triggers health.md updates
 * Runs daily via cron job to detect 14-day rolling average shifts
 */

import { createClient } from '@supabase/supabase-js';

export type MetricShift = {
  metric: 'rhr' | 'bp_systolic' | 'bp_diastolic' | 'weight' | 'hrv';
  old_value: number;
  new_value: number;
  change: number;
  percent_change: number;
  reason: string;
  significance: 'high' | 'medium' | 'low';
};

export class MetricShiftDetector {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabaseUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    this.supabaseKey = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  }

  private getClient() {
    return createClient(this.supabaseUrl, this.supabaseKey);
  }

  /**
   * Detect metric shifts for a user
   */
  async detectShifts(userId: string): Promise<MetricShift[]> {
    const shifts: MetricShift[] = [];

    // Check RHR shift (>3 bpm)
    const rhrShift = await this.detectRHRShift(userId);
    if (rhrShift) shifts.push(rhrShift);

    // Check BP shifts (>5 mmHg systolic or >3 mmHg diastolic)
    const bpShifts = await this.detectBPShifts(userId);
    shifts.push(...bpShifts);

    // Check weight shift (>5 lbs)
    const weightShift = await this.detectWeightShift(userId);
    if (weightShift) shifts.push(weightShift);

    // Check HRV shift (>10% change)
    const hrvShift = await this.detectHRVShift(userId);
    if (hrvShift) shifts.push(hrvShift);

    return shifts;
  }

  /**
   * Detect RHR shift (>3 bpm)
   */
  private async detectRHRShift(userId: string): Promise<MetricShift | null> {
    const supabase = this.getClient();

    // Get last 14 days of RHR data
    const endDate = new Date();
    const startRecent = new Date(endDate);
    startRecent.setDate(startRecent.getDate() - 14);

    // Get baseline (days 30-14 ago)
    const startBaseline = new Date(endDate);
    startBaseline.setDate(startBaseline.getDate() - 30);
    const endBaseline = new Date(endDate);
    endBaseline.setDate(endBaseline.getDate() - 14);

    // Query recent period
    const { data: recentData } = await supabase
      .from('body_metrics')
      .select('resting_hr')
      .eq('user_id', userId)
      .gte('metric_date', startRecent.toISOString().split('T')[0])
      .lte('metric_date', endDate.toISOString().split('T')[0])
      .not('resting_hr', 'is', null);

    // Query baseline period
    const { data: baselineData } = await supabase
      .from('body_metrics')
      .select('resting_hr')
      .eq('user_id', userId)
      .gte('metric_date', startBaseline.toISOString().split('T')[0])
      .lt('metric_date', endBaseline.toISOString().split('T')[0])
      .not('resting_hr', 'is', null);

    if (!recentData || recentData.length < 7 || !baselineData || baselineData.length < 7) {
      return null; // Not enough data
    }

    const recentAvg = recentData.reduce((sum, m) => sum + (m.resting_hr || 0), 0) / recentData.length;
    const baselineAvg = baselineData.reduce((sum, m) => sum + (m.resting_hr || 0), 0) / baselineData.length;
    const change = recentAvg - baselineAvg;

    if (Math.abs(change) > 3) {
      const percentChange = (change / baselineAvg) * 100;
      return {
        metric: 'rhr',
        old_value: Math.round(baselineAvg),
        new_value: Math.round(recentAvg),
        change: Math.round(change),
        percent_change: Math.round(percentChange * 10) / 10,
        reason: `RHR ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(change))} bpm over 14 days`,
        significance: Math.abs(change) > 5 ? 'high' : 'medium',
      };
    }

    return null;
  }

  /**
   * Detect BP shifts
   */
  private async detectBPShifts(userId: string): Promise<MetricShift[]> {
    const supabase = this.getClient();
    const shifts: MetricShift[] = [];

    const endDate = new Date();
    const startRecent = new Date(endDate);
    startRecent.setDate(startRecent.getDate() - 14);

    const startBaseline = new Date(endDate);
    startBaseline.setDate(startBaseline.getDate() - 30);
    const endBaseline = new Date(endDate);
    endBaseline.setDate(endBaseline.getDate() - 14);

    // Query recent BP readings
    const { data: recentData } = await supabase
      .from('bp_readings')
      .select('systolic, diastolic')
      .eq('user_id', userId)
      .gte('reading_date', startRecent.toISOString())
      .lte('reading_date', endDate.toISOString());

    // Query baseline BP readings
    const { data: baselineData } = await supabase
      .from('bp_readings')
      .select('systolic, diastolic')
      .eq('user_id', userId)
      .gte('reading_date', startBaseline.toISOString())
      .lt('reading_date', endBaseline.toISOString());

    if (!recentData || recentData.length < 5 || !baselineData || baselineData.length < 5) {
      return shifts; // Not enough data
    }

    const recentSys = recentData.reduce((sum, r) => sum + r.systolic, 0) / recentData.length;
    const baselineSys = baselineData.reduce((sum, r) => sum + r.systolic, 0) / baselineData.length;
    const sysChange = recentSys - baselineSys;

    if (Math.abs(sysChange) > 5) {
      const percentChange = (sysChange / baselineSys) * 100;
      shifts.push({
        metric: 'bp_systolic',
        old_value: Math.round(baselineSys),
        new_value: Math.round(recentSys),
        change: Math.round(sysChange),
        percent_change: Math.round(percentChange * 10) / 10,
        reason: `Systolic BP ${sysChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(sysChange))} mmHg`,
        significance: Math.abs(sysChange) > 10 ? 'high' : 'medium',
      });
    }

    const recentDia = recentData.reduce((sum, r) => sum + r.diastolic, 0) / recentData.length;
    const baselineDia = baselineData.reduce((sum, r) => sum + r.diastolic, 0) / baselineData.length;
    const diaChange = recentDia - baselineDia;

    if (Math.abs(diaChange) > 3) {
      const percentChange = (diaChange / baselineDia) * 100;
      shifts.push({
        metric: 'bp_diastolic',
        old_value: Math.round(baselineDia),
        new_value: Math.round(recentDia),
        change: Math.round(diaChange),
        percent_change: Math.round(percentChange * 10) / 10,
        reason: `Diastolic BP ${diaChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(diaChange))} mmHg`,
        significance: Math.abs(diaChange) > 5 ? 'high' : 'medium',
      });
    }

    return shifts;
  }

  /**
   * Detect weight shift (>5 lbs)
   */
  private async detectWeightShift(userId: string): Promise<MetricShift | null> {
    const supabase = this.getClient();

    const endDate = new Date();
    const startRecent = new Date(endDate);
    startRecent.setDate(startRecent.getDate() - 14);

    const startBaseline = new Date(endDate);
    startBaseline.setDate(startBaseline.getDate() - 30);
    const endBaseline = new Date(endDate);
    endBaseline.setDate(endBaseline.getDate() - 14);

    const { data: recentData } = await supabase
      .from('body_metrics')
      .select('weight_lbs')
      .eq('user_id', userId)
      .gte('metric_date', startRecent.toISOString().split('T')[0])
      .lte('metric_date', endDate.toISOString().split('T')[0])
      .not('weight_lbs', 'is', null);

    const { data: baselineData } = await supabase
      .from('body_metrics')
      .select('weight_lbs')
      .eq('user_id', userId)
      .gte('metric_date', startBaseline.toISOString().split('T')[0])
      .lt('metric_date', endBaseline.toISOString().split('T')[0])
      .not('weight_lbs', 'is', null);

    if (!recentData || recentData.length < 5 || !baselineData || baselineData.length < 5) {
      return null;
    }

    const recentAvg = recentData.reduce((sum, m) => sum + (m.weight_lbs || 0), 0) / recentData.length;
    const baselineAvg = baselineData.reduce((sum, m) => sum + (m.weight_lbs || 0), 0) / baselineData.length;
    const change = recentAvg - baselineAvg;

    if (Math.abs(change) > 5) {
      const percentChange = (change / baselineAvg) * 100;
      return {
        metric: 'weight',
        old_value: Math.round(baselineAvg * 10) / 10,
        new_value: Math.round(recentAvg * 10) / 10,
        change: Math.round(change * 10) / 10,
        percent_change: Math.round(percentChange * 10) / 10,
        reason: `Weight ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(change * 10) / 10)} lbs`,
        significance: Math.abs(change) > 10 ? 'high' : 'low',
      };
    }

    return null;
  }

  /**
   * Detect HRV shift (>10% change)
   */
  private async detectHRVShift(userId: string): Promise<MetricShift | null> {
    const supabase = this.getClient();

    const endDate = new Date();
    const startRecent = new Date(endDate);
    startRecent.setDate(startRecent.getDate() - 14);

    const startBaseline = new Date(endDate);
    startBaseline.setDate(startBaseline.getDate() - 30);
    const endBaseline = new Date(endDate);
    endBaseline.setDate(endBaseline.getDate() - 14);

    const { data: recentData } = await supabase
      .from('body_metrics')
      .select('hrv_ms')
      .eq('user_id', userId)
      .gte('metric_date', startRecent.toISOString().split('T')[0])
      .lte('metric_date', endDate.toISOString().split('T')[0])
      .not('hrv_ms', 'is', null);

    const { data: baselineData } = await supabase
      .from('body_metrics')
      .select('hrv_ms')
      .eq('user_id', userId)
      .gte('metric_date', startBaseline.toISOString().split('T')[0])
      .lt('metric_date', endBaseline.toISOString().split('T')[0])
      .not('hrv_ms', 'is', null);

    if (!recentData || recentData.length < 7 || !baselineData || baselineData.length < 7) {
      return null;
    }

    const recentAvg = recentData.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) / recentData.length;
    const baselineAvg = baselineData.reduce((sum, m) => sum + (m.hrv_ms || 0), 0) / baselineData.length;
    const change = recentAvg - baselineAvg;
    const percentChange = (change / baselineAvg) * 100;

    if (Math.abs(percentChange) > 10) {
      return {
        metric: 'hrv',
        old_value: Math.round(baselineAvg),
        new_value: Math.round(recentAvg),
        change: Math.round(change),
        percent_change: Math.round(percentChange * 10) / 10,
        reason: `HRV ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(percentChange))}% (${Math.abs(Math.round(change))} ms)`,
        significance: Math.abs(percentChange) > 20 ? 'high' : 'medium',
      };
    }

    return null;
  }
}
