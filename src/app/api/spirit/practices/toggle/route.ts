import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Toggles a practice for a given day.
 *
 * Upserts on (user_id, practice_id, log_date) so tapping twice corrects the
 * entry rather than stacking duplicates, and back-dating yesterday's reading
 * updates that day instead of creating a second row.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const practiceId = typeof body?.practice_id === 'string' ? body.practice_id : null;
  const logDate = typeof body?.log_date === 'string' ? body.log_date : null;
  const completed = body?.completed !== false;

  if (!practiceId || !logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return NextResponse.json({ error: 'practice_id and an ISO log_date are required' }, { status: 400 });
  }

  // Confirm the practice belongs to this user before writing against its id.
  const { data: practice } = await supabase
    .from('practices')
    .select('id')
    .eq('id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 });

  const { error } = await supabase.from('practice_logs').upsert(
    {
      user_id: user.id,
      practice_id: practiceId,
      log_date: logDate,
      completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,practice_id,log_date' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, practice_id: practiceId, log_date: logDate, completed });
}
