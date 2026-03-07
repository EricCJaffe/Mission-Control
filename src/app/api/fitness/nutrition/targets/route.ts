import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, target: data || null });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { data, error } = await supabase
      .from('nutrition_targets')
      .upsert({
        user_id: user.id,
        sodium_max_mg: Number(body.sodium_max_mg) || 2000,
        potassium_target_mg: Number(body.potassium_target_mg) || 3000,
        phosphorus_max_mg: Number(body.phosphorus_max_mg) || 1000,
        protein_target_g: Number(body.protein_target_g) || 150,
        fiber_target_g: Number(body.fiber_target_g) || 30,
        calorie_target: body.calorie_target ? Number(body.calorie_target) : null,
        pattern: typeof body.pattern === 'string' ? body.pattern : 'mediterranean_dash',
        logging_enabled: body.logging_enabled !== false,
        notes: typeof body.notes === 'string' ? body.notes : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, target: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save nutrition targets' },
      { status: 500 }
    );
  }
}
