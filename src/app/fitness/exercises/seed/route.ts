import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// One-time endpoint to verify the seeded global exercises are visible.
// The exercises are seeded via SQL migration with user_id = NULL (global).
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, count } = await supabase
    .from('exercises')
    .select('id, name, category', { count: 'exact' })
    .is('user_id', null);

  return NextResponse.json({ global_exercises: count ?? 0, sample: data?.slice(0, 5) });
}
