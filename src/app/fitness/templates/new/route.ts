import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const form = await req.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return NextResponse.redirect(new URL('/fitness/templates', req.url));

  await supabase.from('workout_templates').insert({
    user_id: user.id,
    name,
    type: String(form.get('type') || 'strength'),
    split_type: String(form.get('split_type') || '') || null,
    structure: [],
    notes: String(form.get('notes') || '') || null,
  });

  return NextResponse.redirect(new URL('/fitness/templates', req.url));
}
