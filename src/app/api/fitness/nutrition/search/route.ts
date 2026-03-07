import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { searchFoodReferences, type FoodReference } from '@/lib/fitness/nutrition';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q')?.trim() || '';
  const barcode = req.nextUrl.searchParams.get('barcode')?.trim() || '';

  if (!query && !barcode) {
    return NextResponse.json({ ok: true, results: [] });
  }

  let request = supabase.from('nutrition_food_reference').select('*').limit(25);
  if (barcode) {
    request = request.eq('barcode', barcode).limit(1);
  } else {
    request = request.ilike('name', `%${query}%`);
  }

  const { data, error } = await request;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const foods = (data || []) as FoodReference[];
  const results = barcode ? foods : searchFoodReferences(query, foods);
  return NextResponse.json({ ok: true, results });
}
