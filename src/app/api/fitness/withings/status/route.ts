import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [{ data: connection }, { data: latestLog }, { count: bodyCount }, { count: bpCount }, { count: sleepCount }, { count: dailyCount }] = await Promise.all([
    supabase
      .from('withings_connections')
      .select('status, provider_user_id, scopes, last_sync_at, last_sync_status, last_error, sync_state, updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('withings_sync_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('sync_started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('body_metrics').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('weight_source', 'Withings'),
    supabase.from('bp_readings').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('source', 'Withings'),
    supabase.from('sleep_logs').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('source', 'Withings'),
    supabase.from('daily_summaries').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('source', 'Withings'),
  ]);

  return NextResponse.json({
    connected: connection?.status === 'connected',
    status: connection?.status || 'disconnected',
    providerUserId: connection?.provider_user_id || null,
    scopes: connection?.scopes || [],
    lastSyncAt: connection?.last_sync_at || null,
    lastSyncStatus: connection?.last_sync_status || null,
    lastError: connection?.last_error || null,
    syncState: connection?.sync_state || {},
    summary: {
      bodyMetrics: bodyCount || 0,
      bloodPressure: bpCount || 0,
      sleepLogs: sleepCount || 0,
      dailySummaries: dailyCount || 0,
    },
    latestLog: latestLog || null,
  });
}
