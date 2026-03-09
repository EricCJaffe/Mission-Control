/**
 * Withings Health Mate Data Importer
 *
 * Imports historical data from a filesystem CSV export.
 * The CSV and OAuth/API paths share the same normalizers so they land in the
 * same tables with the same dedupe behavior.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import * as fs from 'fs';
import * as path from 'path';
import {
  emptyDomainSyncStats,
  upsertBloodPressureFromMeasureGroup,
  upsertBodyMetricsFromMeasureGroup,
  upsertDailySummaryFromActivity,
  upsertSleepFromSeries,
  type DomainSyncStats,
} from './withings-normalizers';
import type {
  WithingsActivityRecord,
  WithingsMeasureGroup,
  WithingsSleepSeries,
} from './withings-client';

export type ImportProgress = {
  category: string;
  current: number;
  total: number;
  status: 'processing' | 'complete' | 'error';
  message?: string;
  errors?: string[];
};

export type ImportResults = {
  bp: DomainSyncStats;
  weight: DomainSyncStats;
  activities: DomainSyncStats;
  dailyAggregates: DomainSyncStats;
  sleep: DomainSyncStats;
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

  async importAll(exportPath: string): Promise<ImportResults> {
    const results: ImportResults = {
      bp: emptyDomainSyncStats(),
      weight: emptyDomainSyncStats(),
      activities: emptyDomainSyncStats(),
      dailyAggregates: emptyDomainSyncStats(),
      sleep: emptyDomainSyncStats(),
    };

    results.bp = await this.importBloodPressure(path.join(exportPath, 'bp.csv'));
    results.weight = await this.importBodyMetrics(path.join(exportPath, 'weight.csv'));
    results.dailyAggregates = await this.importDailyAggregates(exportPath);
    results.sleep = await this.importSleep(path.join(exportPath, 'sleep.csv'));

    return results;
  }

  async importBloodPressure(csvPath: string): Promise<DomainSyncStats> {
    const stats = emptyDomainSyncStats();

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Blood Pressure', 0, 0, 'error', 'bp.csv not found');
      return stats;
    }

    const rows = this.parseCsv(csvPath);
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Blood Pressure', i + 1, total, 'processing');

      if (!row.Systolic || !row.Diastolic || !row.Date) {
        stats.skipped++;
        continue;
      }

      const group: WithingsMeasureGroup = {
        date: Math.floor(new Date(row.Date).getTime() / 1000),
        measures: [
          { type: 10, unit: 0, value: Number(row.Systolic) },
          { type: 9, unit: 0, value: Number(row.Diastolic) },
          ...(row['Heart rate'] ? [{ type: 11, unit: 0, value: Number(row['Heart rate']) }] : []),
        ],
      };

      await this.capture(stats, () => upsertBloodPressureFromMeasureGroup(this.supabase, this.userId, group));
    }

    this.updateProgress('Blood Pressure', total, total, 'complete', this.summaryMessage(stats));
    return stats;
  }

  async importBodyMetrics(csvPath: string): Promise<DomainSyncStats> {
    const stats = emptyDomainSyncStats();

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Body Metrics', 0, 0, 'error', 'weight.csv not found');
      return stats;
    }

    const rows = this.parseCsv(csvPath);
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Body Metrics', i + 1, total, 'processing');

      if (!row.Date || !row['Weight (lb)']) {
        stats.skipped++;
        continue;
      }

      const weightLbs = Number(row['Weight (lb)']);
      const fatMass = row['Fat mass (lb)'] ? Number(row['Fat mass (lb)']) : null;
      const bodyFatRatio = fatMass && weightLbs ? fatMass / weightLbs : null;

      const group: WithingsMeasureGroup = {
        date: Math.floor(new Date(row.Date).getTime() / 1000),
        measures: [
          { type: 1, unit: -5, value: Math.round((weightLbs / 2.20462) * 100000) },
          ...(bodyFatRatio != null ? [{ type: 6, unit: -5, value: Math.round(bodyFatRatio * 100000) }] : []),
          ...(row['Muscle mass (lb)'] ? [{ type: 76, unit: -5, value: Math.round((Number(row['Muscle mass (lb)']) / 2.20462) * 100000) }] : []),
          ...(row['Bone mass (lb)'] ? [{ type: 88, unit: -5, value: Math.round((Number(row['Bone mass (lb)']) / 2.20462) * 100000) }] : []),
          ...(row['Hydration (lb)'] ? [{ type: 77, unit: -5, value: Math.round((Number(row['Hydration (lb)']) / 2.20462) * 100000) }] : []),
        ],
      };

      await this.capture(stats, () => upsertBodyMetricsFromMeasureGroup(this.supabase, this.userId, group));
    }

    this.updateProgress('Body Metrics', total, total, 'complete', this.summaryMessage(stats));
    return stats;
  }

  async importActivities(): Promise<DomainSyncStats> {
    return emptyDomainSyncStats();
  }

  async importDailyAggregates(exportPath: string): Promise<DomainSyncStats> {
    const stats = emptyDomainSyncStats();
    const aggregatesData = new Map<string, Record<string, unknown>>();
    const aggregateFiles = [
      'aggregates_steps.csv',
      'aggregates_calories_earned.csv',
      'aggregates_calories_passive.csv',
      'aggregates_distance.csv',
      'aggregates_elevation.csv',
    ];

    for (const fileName of aggregateFiles) {
      const filePath = path.join(exportPath, fileName);
      if (!fs.existsSync(filePath)) continue;

      for (const row of this.parseCsv(filePath)) {
        if (!row.date) continue;
        const current: WithingsActivityRecord = (aggregatesData.get(row.date) || { date: row.date }) as WithingsActivityRecord;
        const value = Number(row.value || 0);

        if (fileName.includes('steps')) current.steps = value;
        if (fileName.includes('calories_earned')) current.calories = value;
        if (fileName.includes('calories_passive')) current.totalcalories = value + Number(current.calories || 0);
        if (fileName.includes('distance')) current.distance = value;
        if (fileName.includes('elevation')) current.elevation = value;

        aggregatesData.set(row.date, current);
      }
    }

    const rows = Array.from(aggregatesData.values()) as WithingsActivityRecord[];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      this.updateProgress('Daily Aggregates', i + 1, total, 'processing');
      await this.capture(stats, () => upsertDailySummaryFromActivity(this.supabase, this.userId, rows[i]));
    }

    this.updateProgress('Daily Aggregates', total, total, 'complete', this.summaryMessage(stats));
    return stats;
  }

  async importSleep(csvPath: string): Promise<DomainSyncStats> {
    const stats = emptyDomainSyncStats();

    if (!fs.existsSync(csvPath)) {
      this.updateProgress('Sleep', 0, 0, 'error', 'sleep.csv not found');
      return stats;
    }

    const rows = this.parseCsv(csvPath);
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      this.updateProgress('Sleep', i + 1, total, 'processing');

      if (!row.from || !row.to) {
        stats.skipped++;
        continue;
      }

      const series: WithingsSleepSeries = {
        startdate: Math.floor(new Date(row.from).getTime() / 1000),
        enddate: Math.floor(new Date(row.to).getTime() / 1000),
        total_sleep_duration: numberOrNull(row['light (s)']) + numberOrNull(row['deep (s)']) + numberOrNull(row['rem (s)']),
        lightsleepduration: numberOrNull(row['light (s)']),
        deepsleepduration: numberOrNull(row['deep (s)']),
        remsleepduration: numberOrNull(row['rem (s)']),
        wakeupduration: numberOrNull(row['awake (s)']),
        hr_average: numberOrNull(row['Average heart rate']),
        hr_min: numberOrNull(row['Heart rate (min)']),
        hr_max: numberOrNull(row['Heart rate (max)']),
        durationtosleep: numberOrNull(row['Duration to sleep (s)']),
        durationtowakeup: numberOrNull(row['Duration to wake up (s)']),
        wakeupcount: numberOrNull(row['wake up']),
        snoring: numberOrNull(row['Snoring (s)']),
        rr_average: row['Average respiration rate'] ? Number(row['Average respiration rate']) : null,
      };

      await this.capture(stats, () => upsertSleepFromSeries(this.supabase, this.userId, series));
    }

    this.updateProgress('Sleep', total, total, 'complete', this.summaryMessage(stats));
    return stats;
  }

  private parseCsv(csvPath: string): Array<Record<string, string>> {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const { data, errors } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    if (errors.length > 0) {
      throw new Error(`Failed to parse ${path.basename(csvPath)}: ${errors.length} parse errors`);
    }
    return data as Array<Record<string, string>>;
  }

  private async capture(stats: DomainSyncStats, fn: () => Promise<'imported' | 'updated' | 'skipped'>) {
    try {
      const result = await fn();
      stats[result] += 1;
    } catch (error) {
      stats.errors += 1;
      console.error('[WithingsImporter]', error);
    }
  }

  private summaryMessage(stats: DomainSyncStats) {
    return `Imported ${stats.imported}, updated ${stats.updated}, skipped ${stats.skipped}`;
  }

  private updateProgress(category: string, current: number, total: number, status: 'processing' | 'complete' | 'error', message?: string) {
    if (this.progressCallback) {
      this.progressCallback({ category, current, total, status, message });
    }
  }
}

function numberOrNull(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isNaN(numeric) ? 0 : Math.round(numeric);
}
