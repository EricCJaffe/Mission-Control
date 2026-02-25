import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const form = await req.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return NextResponse.redirect(new URL('/fitness/equipment', req.url));

  const maxMiles = form.get('max_distance_miles');
  const purchaseDate = form.get('purchase_date');

  await supabase.from('equipment').insert({
    user_id: user.id,
    name,
    type: String(form.get('type') || 'other'),
    brand: String(form.get('brand') || '') || null,
    model: String(form.get('model') || '') || null,
    max_distance_miles: maxMiles ? parseFloat(String(maxMiles)) : null,
    purchase_date: purchaseDate ? String(purchaseDate) : null,
    status: 'active',
  });

  return NextResponse.redirect(new URL('/fitness/equipment', req.url));
}
