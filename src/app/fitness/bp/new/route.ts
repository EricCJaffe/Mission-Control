import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { classifyBP } from '@/lib/fitness/alerts';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const form = await req.formData();
  const systolic = parseInt(String(form.get('systolic') || '0'));
  const diastolic = parseInt(String(form.get('diastolic') || '0'));

  if (!systolic || !diastolic) {
    return NextResponse.redirect(new URL('/fitness/bp', req.url));
  }

  const pulse = form.get('pulse') ? parseInt(String(form.get('pulse'))) : null;
  const flag_level = classifyBP(systolic, diastolic);

  await supabase.from('bp_readings').insert({
    user_id: user.id,
    systolic,
    diastolic,
    pulse,
    position: String(form.get('position') || 'seated'),
    arm: String(form.get('arm') || 'left'),
    time_of_day: String(form.get('time_of_day') || ''),
    pre_or_post_meds: String(form.get('pre_or_post_meds') || ''),
    pre_or_post_workout: String(form.get('pre_or_post_workout') || ''),
    notes: String(form.get('notes') || ''),
    flag_level,
    source: 'manual',
  });

  return NextResponse.redirect(new URL('/fitness/bp', req.url));
}
