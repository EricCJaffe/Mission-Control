import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: profile } = await supabase
      .from('athlete_profile')
      .select('garmin_email, garmin_last_sync')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      connected: !!profile?.garmin_email,
      email: profile?.garmin_email || null,
      lastSync: profile?.garmin_last_sync || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch status';
    console.error('Garmin status error:', message);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
