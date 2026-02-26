import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GarminClient } from '@/lib/fitness/garmin-client';
import { GarminSyncService } from '@/lib/fitness/garmin-sync-service';
import { decryptTokens } from '@/lib/fitness/garmin-tokens';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { days = 7 } = await req.json().catch(() => ({ days: 7 }));

    // Load Garmin credentials
    const { data: profile } = await supabase
      .from('athlete_profile')
      .select('garmin_email, garmin_tokens')
      .eq('user_id', user.id)
      .single();

    if (!profile?.garmin_email || !profile?.garmin_tokens) {
      return NextResponse.json(
        { error: 'Garmin not configured. Please connect your Garmin account first.' },
        { status: 400 }
      );
    }

    // Log sync start
    const { data: syncLog } = await supabase
      .from('garmin_sync_logs')
      .insert({
        user_id: user.id,
        status: 'running',
        sync_started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const syncLogId = syncLog?.id;

    try {
      // Decrypt tokens and create client
      const tokens = decryptTokens(profile.garmin_tokens);
      const client = new GarminClient(profile.garmin_email, ''); // Password not needed with tokens
      client.setTokens(tokens);

      // Run sync
      const syncService = new GarminSyncService(client, user.id);
      const result = await syncService.syncAll(days);

      // Update sync log
      if (syncLogId) {
        await supabase
          .from('garmin_sync_logs')
          .update({
            status: result.success ? 'success' : 'failed',
            sync_completed_at: new Date().toISOString(),
            metrics_synced: result.metricsCount,
            activities_synced: result.activitiesCount,
            error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
          })
          .eq('id', syncLogId);
      }

      // Update last sync timestamp
      await supabase
        .from('athlete_profile')
        .update({ garmin_last_sync: new Date().toISOString() })
        .eq('user_id', user.id);

      return NextResponse.json({
        success: result.success,
        metricsCount: result.metricsCount,
        activitiesCount: result.activitiesCount,
        errors: result.errors,
        message: result.success
          ? `Synced ${result.metricsCount} days of metrics and ${result.activitiesCount} activities`
          : `Sync completed with errors: ${result.errors.join('; ')}`,
      });
    } catch (syncError) {
      // Update sync log with failure
      if (syncLogId) {
        await supabase
          .from('garmin_sync_logs')
          .update({
            status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_message: syncError instanceof Error ? syncError.message : 'Unknown error',
          })
          .eq('id', syncLogId);
      }

      throw syncError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('Garmin sync error:', message);

    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
