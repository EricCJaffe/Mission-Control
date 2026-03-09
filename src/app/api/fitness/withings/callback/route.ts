import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { WithingsClient } from '@/lib/fitness/withings-client';
import { encryptWithingsTokens } from '@/lib/fitness/withings-tokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const settingsUrl = new URL('/fitness/settings/withings', request.url);

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    settingsUrl.searchParams.set('error', 'login_required');
    return NextResponse.redirect(settingsUrl);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('withings_oauth_state')?.value;

  if (error) {
    settingsUrl.searchParams.set('error', error);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set('error', 'invalid_state');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const client = new WithingsClient();
    const tokens = await client.exchangeAuthorizationCode(code);

    const { error: upsertError } = await supabase
      .from('withings_connections')
      .upsert(
        {
          user_id: user.id,
          status: 'connected',
          provider_user_id: tokens.userid,
          encrypted_tokens: encryptWithingsTokens(tokens),
          scopes: tokens.scope.split(',').map((scope) => scope.trim()).filter(Boolean),
          last_error: null,
          last_sync_status: null,
          sync_state: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      throw upsertError;
    }

    settingsUrl.searchParams.set('connected', '1');
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.set('withings_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  } catch (callbackError) {
    settingsUrl.searchParams.set('error', callbackError instanceof Error ? callbackError.message : 'callback_failed');
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.set('withings_oauth_state', '', { maxAge: 0, path: '/' });
    return response;
  }
}
