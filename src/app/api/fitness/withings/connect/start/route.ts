import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildWithingsAuthorizeUrl } from '@/lib/fitness/withings-client';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = randomBytes(24).toString('hex');
    const authUrl = buildWithingsAuthorizeUrl(state);
    const response = NextResponse.json({ ok: true, authUrl });
    response.cookies.set('withings_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start Withings auth' },
      { status: 500 }
    );
  }
}
