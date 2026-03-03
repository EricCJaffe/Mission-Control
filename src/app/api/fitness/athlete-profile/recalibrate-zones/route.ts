import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateSeasonalHRZones } from '@/lib/fitness/hr-zones';

/**
 * POST /api/fitness/athlete-profile/recalibrate-zones
 * Recalculates HR zones based on current season and stored max HR ceiling.
 * Should be called periodically (monthly) or when user visits settings.
 */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('max_hr_ceiling, hr_zones')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'No athlete profile found' }, { status: 404 });
  }

  const maxHR = profile.max_hr_ceiling ?? 155;
  const { zones, effectiveMaxHR, seasonal } = calculateSeasonalHRZones(maxHR);

  // Update zones in profile
  const { error } = await supabase
    .from('athlete_profile')
    .update({
      hr_zones: zones,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    base_max_hr: maxHR,
    effective_max_hr: effectiveMaxHR,
    seasonal,
    previous_zones: profile.hr_zones,
    new_zones: zones,
    changed: JSON.stringify(profile.hr_zones) !== JSON.stringify(zones),
  });
}
