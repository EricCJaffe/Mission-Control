import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getFlourishingHistory } from '@/lib/flourishing/profile';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || '12');
  const history = await getFlourishingHistory(user.id, Number.isNaN(limit) ? 12 : Math.min(limit, 36));

  return NextResponse.json({ ok: true, history });
}
