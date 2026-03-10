import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { decryptWithingsTokens, encryptWithingsTokens } from '@/lib/fitness/withings-tokens';
import { WithingsSyncService, type WithingsSyncMode } from '@/lib/fitness/withings-sync-service';
import { HealthDocUpdater, type UpdateTrigger } from '@/lib/fitness/health-doc-updater';
import { MetricShiftDetector } from '@/lib/fitness/metric-shift-detector';
import type { SectionUpdate } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedMode = body?.mode as WithingsSyncMode | undefined;

  const { data: connection } = await supabase
    .from('withings_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!connection?.encrypted_tokens) {
    return NextResponse.json({ error: 'Withings is not connected' }, { status: 400 });
  }

  const mode: WithingsSyncMode = requestedMode || (connection.last_sync_at ? 'incremental' : 'initial');

  const { data: logRow, error: logInsertError } = await supabase
    .from('withings_sync_logs')
    .insert({
      user_id: user.id,
      connection_id: connection.id,
      sync_mode: mode,
      status: 'running',
    })
    .select('id')
    .single();

  if (logInsertError) {
    return NextResponse.json({ error: logInsertError.message }, { status: 500 });
  }

  await supabase
    .from('withings_connections')
    .update({ last_sync_status: 'running', last_error: null })
    .eq('user_id', user.id);

  try {
    const tokens = decryptWithingsTokens(connection.encrypted_tokens);
    const syncService = new WithingsSyncService(user.id, tokens);
    const { results, refreshedTokens } = await syncService.sync(mode);

    await supabase
      .from('withings_connections')
      .update({
        encrypted_tokens: encryptWithingsTokens(refreshedTokens),
        provider_user_id: refreshedTokens.userid,
        scopes: refreshedTokens.scope.split(',').map((scope) => scope.trim()).filter(Boolean),
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_error: null,
        status: 'connected',
        sync_state: {
          mode,
          last_synced_through: new Date().toISOString(),
          latest_results: results,
        },
      })
      .eq('user_id', user.id);

    await supabase
      .from('withings_sync_logs')
      .update({
        status: 'success',
        sync_completed_at: new Date().toISOString(),
        bp_imported: results.bp.imported,
        bp_updated: results.bp.updated,
        bp_skipped: results.bp.skipped,
        bp_errors: results.bp.errors,
        body_imported: results.weight.imported,
        body_updated: results.weight.updated,
        body_skipped: results.weight.skipped,
        body_errors: results.weight.errors,
        sleep_imported: results.sleep.imported,
        sleep_updated: results.sleep.updated,
        sleep_skipped: results.sleep.skipped,
        sleep_errors: results.sleep.errors,
        daily_imported: results.dailyAggregates.imported,
        daily_updated: results.dailyAggregates.updated,
        daily_skipped: results.dailyAggregates.skipped,
        daily_errors: results.dailyAggregates.errors,
      })
      .eq('id', logRow.id);

    const queuedUpdates = await triggerHealthDocFollowThrough(user.id, results);

    return NextResponse.json({
      ok: true,
      mode,
      results,
      queuedUpdates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Withings sync failed';

    await supabase
      .from('withings_connections')
      .update({
        last_sync_status: 'failed',
        last_error: message,
        status: 'error',
      })
      .eq('user_id', user.id);

    await supabase
      .from('withings_sync_logs')
      .update({
        status: 'failed',
        sync_completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', logRow.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function triggerHealthDocFollowThrough(
  userId: string,
  results: {
    bp: { imported: number; updated: number };
    weight: { imported: number; updated: number };
    sleep: { imported: number; updated: number };
    dailyAggregates: { imported: number; updated: number };
  }
) {
  const updates: SectionUpdate[] = [];
  const updater = new HealthDocUpdater(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const triggerSummaries: Array<{ trigger: UpdateTrigger; data: Record<string, unknown> }> = [];

  if (results.bp.imported + results.bp.updated > 0) {
    triggerSummaries.push({
      trigger: 'bp_reading',
      data: { source: 'withings_api', count: results.bp.imported + results.bp.updated },
    });
  }

  if (results.weight.imported + results.weight.updated + results.sleep.imported + results.sleep.updated + results.dailyAggregates.imported + results.dailyAggregates.updated > 0) {
    const detector = new MetricShiftDetector(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const shifts = await detector.detectShifts(userId);

    if (shifts.length > 0) {
      triggerSummaries.push({
        trigger: 'metric_shift',
        data: {
          source: 'withings_api',
          shifts,
          body_count: results.weight.imported + results.weight.updated,
          sleep_count: results.sleep.imported + results.sleep.updated,
          daily_count: results.dailyAggregates.imported + results.dailyAggregates.updated,
        },
      });
    }
  }

  for (const item of triggerSummaries) {
    const nextUpdates = await updater.detectUpdates(userId, item.trigger, item.data);
    updates.push(...nextUpdates);
  }

  if (updates.length === 0) {
    return 0;
  }

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: recentUpdates } = await serviceSupabase
    .from('health_doc_pending_updates')
    .select('section_number')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const recentSections = new Set((recentUpdates || []).map((row) => row.section_number));
  const freshUpdates = updates.filter((update) => !recentSections.has(update.section_number));

  if (freshUpdates.length === 0) {
    return 0;
  }

  const ids = await updater.savePendingUpdates(userId, freshUpdates);
  return ids.length;
}
