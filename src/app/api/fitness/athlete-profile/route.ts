import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculatePowerZones } from '@/lib/fitness/power-zones';

/**
 * GET /api/fitness/athlete-profile — Get or create athlete profile
 * PUT /api/fitness/athlete-profile — Update profile settings
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile) {
    return NextResponse.json(profile);
  }

  // Create default profile
  const { data: newProfile, error } = await supabase
    .from('athlete_profile')
    .insert({
      user_id: user.id,
      max_hr_ceiling: 155,
      lactate_threshold_hr: 140,
      hr_zones: { z1: [100, 115], z2: [115, 133], z3: [133, 145], z4: [145, 155] },
      sleep_target_min: 450,
      beta_blocker_multiplier: 1.15,
      medications: [{ name: 'Carvedilol', dose: '12.5mg', frequency: '2x daily' }],
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(newProfile);
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Auto-calculate power zones if FTP was updated
  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  if (body.ftp_watts && body.ftp_watts > 0) {
    updates.power_zones = calculatePowerZones(body.ftp_watts);
  }

  const { data: profile, error } = await supabase
    .from('athlete_profile')
    .upsert({
      user_id: user.id,
      ...updates,
    }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(profile);
}
