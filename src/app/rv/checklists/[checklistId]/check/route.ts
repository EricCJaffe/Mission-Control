import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { setChecked } from '@/lib/rv/runs';

/* JSON in, JSON out: the checklist screen ticks optimistically and needs to
   know when a write failed, so it can untick and say so. */
export async function POST(req: Request, ctx: { params: Promise<{ checklistId: string }> }) {
  const { checklistId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Signed out' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { item_id?: string; checked?: boolean };
  if (!body.item_id || typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'item_id and checked are required' }, { status: 400 });
  }
  try {
    const result = await setChecked(supabase, userData.user.id, checklistId, body.item_id, body.checked);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
