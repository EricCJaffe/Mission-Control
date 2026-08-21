import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { PERSON_COOKIE } from '@/lib/health/people';

export const dynamic = 'force-dynamic';

/** Switch which person the health module is showing. */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const personId = typeof body?.person_id === 'string' ? body.person_id : null;
  if (!personId) return NextResponse.json({ error: 'person_id required' }, { status: 400 });

  // Confirm the person belongs to this account before trusting the cookie —
  // otherwise a forged value would select someone else's records.
  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('id', personId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

  const res = NextResponse.json({ ok: true, person_id: personId });
  res.cookies.set(PERSON_COOKIE, personId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
