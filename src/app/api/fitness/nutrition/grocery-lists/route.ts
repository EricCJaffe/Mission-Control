import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('nutrition_grocery_lists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lists: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items.map(String).filter(Boolean) : [];
    if (items.length === 0) return NextResponse.json({ error: 'At least one grocery item is required' }, { status: 400 });

    const { data, error } = await supabase
      .from('nutrition_grocery_lists')
      .insert({
        user_id: user.id,
        title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Nutrition Grocery List',
        goal: typeof body.goal === 'string' ? body.goal : null,
        items,
        source: typeof body.source === 'string' ? body.source : 'ai_suggestions',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, list: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save grocery list' }, { status: 500 });
  }
}
