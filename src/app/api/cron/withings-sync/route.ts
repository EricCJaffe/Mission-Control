import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decryptWithingsTokens, encryptWithingsTokens } from '@/lib/fitness/withings-tokens';
import { WithingsSyncService } from '@/lib/fitness/withings-sync-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled Withings sync.
 *
 * Withings is the source of truth for blood pressure and body composition, and
 * nothing else writes them — so if the sync never runs, those metrics simply
 * stop. It was manual-only until now, which is exactly how it went from
 * 2026-03-11 to 2026-08-02 without anyone noticing.
 *
 * Service-role and fail-closed, like the other cron. Runs every connected
 * account; one failure doesn't abort the rest.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    ['CRON_SECRET', secret],
    ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    return NextResponse.json(
      {
        error: 'Cron is not configured on this deployment.',
        missing_env: missing,
        hint: 'Set these for Production in Vercel, then redeploy.',
      },
      { status: 503 }
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 'error' is included: a previous failed run marks the connection as error,
  // but the credentials are usually still fine and a retry is what's wanted.
  const { data: connections, error } = await supabase
    .from('withings_connections')
    .select('id, user_id, encrypted_tokens, last_sync_at')
    .in('status', ['connected', 'error']);

  if (error) {
    console.error('[cron/withings-sync] failed to load connections:', error.message);
    return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 });
  }

  const results: Array<{ user_id: string; status: string; detail?: string }> = [];

  for (const connection of connections ?? []) {
    if (!connection.encrypted_tokens) continue;

    const { data: logRow } = await supabase
      .from('withings_sync_logs')
      .insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        sync_mode: 'incremental',
        status: 'running',
      })
      .select('id')
      .single();

    let tokens: ReturnType<typeof decryptWithingsTokens> | null = null;
    let service: WithingsSyncService | null = null;

    try {
      tokens = decryptWithingsTokens(connection.encrypted_tokens);
      service = new WithingsSyncService(connection.user_id, tokens);
      const mode = connection.last_sync_at ? 'incremental' : 'initial';
      const { results: syncResults, refreshedTokens } = await service.sync(mode);

      await supabase
        .from('withings_connections')
        .update({
          encrypted_tokens: encryptWithingsTokens(refreshedTokens),
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_error: null,
          status: 'connected',
          sync_state: {
            mode,
            last_synced_through: new Date().toISOString(),
            latest_results: syncResults,
          },
        })
        .eq('id', connection.id);

      if (logRow) {
        await supabase
          .from('withings_sync_logs')
          .update({
            status: 'success',
            sync_completed_at: new Date().toISOString(),
            bp_imported: syncResults.bp.imported,
            bp_updated: syncResults.bp.updated,
            body_imported: syncResults.weight.imported,
            body_updated: syncResults.weight.updated,
            sleep_imported: syncResults.sleep.imported,
            sleep_updated: syncResults.sleep.updated,
            daily_imported: syncResults.dailyAggregates.imported,
            daily_updated: syncResults.dailyAggregates.updated,
          })
          .eq('id', logRow.id);
      }

      results.push({ user_id: connection.user_id, status: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withings sync failed';

      // Withings rotates the refresh token on every refresh. If one happened
      // before the failure, the stored token is already dead — persist the
      // rotated pair or the connection silently needs re-authorising.
      const update: Record<string, unknown> = {
        last_sync_status: 'failed',
        last_error: message,
        status: 'error',
      };
      try {
        const latest = service?.currentTokens();
        if (latest && tokens && latest.refresh_token !== tokens.refresh_token) {
          update.encrypted_tokens = encryptWithingsTokens(latest);
          update.status = 'connected';
        }
      } catch {
        // Best effort; never mask the original failure.
      }

      await supabase.from('withings_connections').update(update).eq('id', connection.id);
      if (logRow) {
        await supabase
          .from('withings_sync_logs')
          .update({
            status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_message: message,
          })
          .eq('id', logRow.id);
      }

      console.error(`[cron/withings-sync] user ${connection.user_id}: ${message}`);
      results.push({ user_id: connection.user_id, status: 'failed', detail: message });
    }
  }

  return NextResponse.json({
    ok: true,
    connections: results.length,
    succeeded: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'failed').length,
  });
}
