import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { resetRun } from '@/lib/rv/runs';

export async function POST(_req: Request, ctx: { params: Promise<{ checklistId: string }> }) {
  const { checklistId } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  try {
    await resetRun(supabase, userData.user.id, checklistId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
