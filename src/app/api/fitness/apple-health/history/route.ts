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

  const { data: imports } = await supabase
    .from('apple_health_imports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Counts
  const [
    { count: workoutCount },
    { count: sleepCount },
    { count: dailyCount },
  ] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('import_source', 'Apple Health'),
    supabase
      .from('sleep_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'Apple Health'),
    supabase
      .from('daily_summaries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'Apple Health'),
  ]);

  return NextResponse.json({
    imports: imports ?? [],
    summary: {
      workouts: workoutCount ?? 0,
      sleepLogs: sleepCount ?? 0,
      dailySummaries: dailyCount ?? 0,
    },
  });
}
