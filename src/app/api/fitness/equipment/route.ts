import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, type, brand, model, max_distance_miles, purchase_date } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabase.from('equipment').insert({
    user_id: user.id,
    name: name.trim(),
    type: type || 'other',
    brand: brand || null,
    model: model || null,
    max_distance_miles: max_distance_miles ? parseFloat(max_distance_miles) : null,
    purchase_date: purchase_date || null,
    status: 'active',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, name, type, brand, model, max_distance_miles, total_distance_miles, status, purchase_date } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (type !== undefined) updates.type = type;
  if (brand !== undefined) updates.brand = brand || null;
  if (model !== undefined) updates.model = model || null;
  if (max_distance_miles !== undefined) updates.max_distance_miles = max_distance_miles ? parseFloat(max_distance_miles) : null;
  if (total_distance_miles !== undefined) updates.total_distance_miles = parseFloat(total_distance_miles);
  if (status !== undefined) updates.status = status;
  if (purchase_date !== undefined) updates.purchase_date = purchase_date || null;

  const { data, error } = await supabase
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
