import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const form = await req.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return NextResponse.redirect(new URL('/fitness/exercises', req.url));

  const category = String(form.get('category') || 'push');
  const equipment = String(form.get('equipment') || '') || null;
  const muscleGroupsRaw = String(form.get('muscle_groups') || '');
  const muscle_groups = muscleGroupsRaw
    ? muscleGroupsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  await supabase.from('exercises').insert({
    user_id: user.id,
    name,
    category,
    equipment,
    muscle_groups,
    is_compound: form.get('is_compound') === 'true',
    is_template: false,
  });

  return NextResponse.redirect(new URL('/fitness/exercises', req.url));
}
