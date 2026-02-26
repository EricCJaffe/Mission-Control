import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GarminClient } from '@/lib/fitness/garmin-client';
import { encryptTokens } from '@/lib/fitness/garmin-tokens';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, password, mfaCode } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Authenticate with Garmin (with optional MFA code)
    const client = new GarminClient(email, password, mfaCode);
    const loginResult = await client.login();

    // Check if MFA is required
    if (loginResult && 'mfaRequired' in loginResult) {
      return NextResponse.json({
        mfaRequired: true,
        mfaTicket: loginResult.mfaTicket,
        message: 'MFA code required. Please enter your 6-digit code.',
      });
    }

    const tokens = client.getTokens();
    if (!tokens) {
      return NextResponse.json(
        { error: 'Failed to obtain Garmin tokens' },
        { status: 500 }
      );
    }

    // Encrypt and store tokens
    const encryptedTokens = encryptTokens(tokens);

    const { error: updateError } = await supabase
      .from('athlete_profile')
      .upsert(
        {
          user_id: user.id,
          garmin_email: email,
          garmin_tokens: encryptedTokens,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to store credentials: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Garmin connected successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    console.error('Garmin auth error:', message);

    return NextResponse.json(
      { error: message },
      { status: 401 }
    );
  }
}
