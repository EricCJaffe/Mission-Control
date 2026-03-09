import { createClient } from '@supabase/supabase-js';
import {
  emptyDomainSyncStats,
  upsertBloodPressureFromMeasureGroup,
  upsertBodyMetricsFromMeasureGroup,
  upsertDailySummaryFromActivity,
  upsertSleepFromSeries,
  type DomainSyncStats,
  type WithingsSyncResults,
} from './withings-normalizers';
import { WithingsClient } from './withings-client';
import type { WithingsTokens } from './withings-tokens';

export type WithingsSyncMode = 'initial' | 'incremental' | 'manual';

export class WithingsSyncService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  constructor(private userId: string, private tokens: WithingsTokens) {}

  async sync(mode: WithingsSyncMode): Promise<{ results: WithingsSyncResults; refreshedTokens: WithingsTokens }> {
    const client = new WithingsClient(this.tokens);
    const { startDate, endDate } = await this.getSyncWindow(mode);

    const results: WithingsSyncResults = {
      bp: emptyDomainSyncStats(),
      weight: emptyDomainSyncStats(),
      dailyAggregates: emptyDomainSyncStats(),
      sleep: emptyDomainSyncStats(),
    };

    const [measures, activities, sleepSeries] = await Promise.all([
      client.getMeasures(startDate, endDate),
      client.getActivitySummaries(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
      client.getSleepSummary(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
    ]);

    for (const group of measures) {
      await this.captureResult(results.bp, async () => upsertBloodPressureFromMeasureGroup(this.supabase, this.userId, group));
      await this.captureResult(results.weight, async () => upsertBodyMetricsFromMeasureGroup(this.supabase, this.userId, group));
    }

    for (const activity of activities) {
      await this.captureResult(results.dailyAggregates, async () => upsertDailySummaryFromActivity(this.supabase, this.userId, activity));
    }

    for (const series of sleepSeries) {
      await this.captureResult(results.sleep, async () => upsertSleepFromSeries(this.supabase, this.userId, series));
    }

    return { results, refreshedTokens: client.getTokens() || this.tokens };
  }

  private async captureResult(stats: DomainSyncStats, fn: () => Promise<'imported' | 'updated' | 'skipped'>) {
    try {
      const status = await fn();
      stats[status] += 1;
    } catch (error) {
      stats.errors += 1;
      console.error('[WithingsSync]', error);
    }
  }

  private async getSyncWindow(mode: WithingsSyncMode): Promise<{ startDate: Date; endDate: Date }> {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (mode === 'incremental') {
      const { data: connection } = await this.supabase
        .from('withings_connections')
        .select('last_sync_at')
        .eq('user_id', this.userId)
        .maybeSingle();

      const lastSyncAt = connection?.last_sync_at ? new Date(connection.last_sync_at) : null;
      const startDate = lastSyncAt ? new Date(lastSyncAt.getTime() - 24 * 60 * 60 * 1000) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return { startDate, endDate };
    }

    const hasLegacyWithingsData = await this.hasExistingWithingsData();
    const backfillDays = hasLegacyWithingsData ? 30 : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - backfillDays);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }

  private async hasExistingWithingsData(): Promise<boolean> {
    const [{ count: bodyCount }, { count: bpCount }, { count: sleepCount }, { count: dailyCount }] = await Promise.all([
      this.supabase.from('body_metrics').select('*', { count: 'exact', head: true }).eq('user_id', this.userId).eq('weight_source', 'Withings'),
      this.supabase.from('bp_readings').select('*', { count: 'exact', head: true }).eq('user_id', this.userId).eq('source', 'Withings'),
      this.supabase.from('sleep_logs').select('*', { count: 'exact', head: true }).eq('user_id', this.userId).eq('source', 'Withings'),
      this.supabase.from('daily_summaries').select('*', { count: 'exact', head: true }).eq('user_id', this.userId).eq('source', 'Withings'),
    ]);

    return Boolean((bodyCount || 0) + (bpCount || 0) + (sleepCount || 0) + (dailyCount || 0));
  }
}
