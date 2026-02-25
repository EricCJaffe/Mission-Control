import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const form = await req.formData();
  const metric_date = String(form.get('metric_date') || new Date().toISOString().slice(0, 10));

  const num = (key: string) => {
    const v = form.get(key);
    if (!v || String(v).trim() === '') return null;
    return parseFloat(String(v));
  };

  const payload = {
    user_id: user.id,
    metric_date,
    weight_lbs: num('weight_lbs'),
    body_fat_pct: num('body_fat_pct'),
    muscle_mass_lbs: num('muscle_mass_lbs'),
    resting_hr: num('resting_hr'),
    hrv_ms: num('hrv_ms'),
    body_battery: num('body_battery'),
    sleep_score: num('sleep_score'),
    notes: String(form.get('notes') || '') || null,
    weight_source: 'manual',
  };

  // Upsert by user + date
  await supabase
    .from('body_metrics')
    .upsert(payload, { onConflict: 'user_id,metric_date' });

  return NextResponse.redirect(new URL('/fitness', req.url));
}
