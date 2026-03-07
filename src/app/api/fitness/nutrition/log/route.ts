import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { rateFoodForCardiacKidneyTargets, sumNutrition } from '@/lib/fitness/nutrition';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [{ data: logs }, { data: target }] = await Promise.all([
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    logs: logs || [],
    target: target || null,
    totals: sumNutrition(logs || []),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const rating = rateFoodForCardiacKidneyTargets({
      sodium_mg: Number(body.sodium_mg) || 0,
      potassium_mg: Number(body.potassium_mg) || 0,
      phosphorus_mg: Number(body.phosphorus_mg) || 0,
      protein_g: Number(body.protein_g) || 0,
    });

    const { data, error } = await supabase
      .from('nutrition_logs')
      .insert({
        user_id: user.id,
        logged_at: typeof body.logged_at === 'string' ? body.logged_at : new Date().toISOString(),
        meal_type: typeof body.meal_type === 'string' ? body.meal_type : 'meal',
        food_name: String(body.food_name || '').trim(),
        serving_size: typeof body.serving_size === 'string' ? body.serving_size : null,
        calories: body.calories ? Number(body.calories) : null,
        protein_g: body.protein_g ? Number(body.protein_g) : null,
        carbs_g: body.carbs_g ? Number(body.carbs_g) : null,
        fat_g: body.fat_g ? Number(body.fat_g) : null,
        fiber_g: body.fiber_g ? Number(body.fiber_g) : null,
        sugar_g: body.sugar_g ? Number(body.sugar_g) : null,
        sodium_mg: body.sodium_mg ? Number(body.sodium_mg) : null,
        potassium_mg: body.potassium_mg ? Number(body.potassium_mg) : null,
        phosphorus_mg: body.phosphorus_mg ? Number(body.phosphorus_mg) : null,
        saturated_fat_g: body.saturated_fat_g ? Number(body.saturated_fat_g) : null,
        barcode: typeof body.barcode === 'string' ? body.barcode : null,
        source: typeof body.source === 'string' ? body.source : 'manual',
        food_rating: rating,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        notes: typeof body.notes === 'string' ? body.notes : null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, log: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save food log' },
      { status: 500 }
    );
  }
}
