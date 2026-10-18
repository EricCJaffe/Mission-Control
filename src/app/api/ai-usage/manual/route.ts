import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { CONFIG_PLANS, isMissingRelation } from '@/lib/ai-usage/load';
import { MANUAL_CONFLICT, parseManual } from '@/lib/ai-usage/manual';

export const dynamic = 'force-dynamic';

/*
 * POST /api/ai-usage/manual: Eric's own reading off a vendor usage page.
 * Signed-in only, written through RLS as that user. Chief of Staff's daily
 * Grok reading goes through the collector's file, not this route.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  const { data: plans, error: planErr } = await supabase.from('ai_plans').select('slug');
  if (planErr && !isMissingRelation(planErr)) {
    return NextResponse.json({ ok: false, error: planErr.message }, { status: 500 });
  }
  const known = [...new Set([...(plans ?? []).map((p: { slug: string }) => p.slug), ...CONFIG_PLANS.map((p) => p.slug)])];

  const parsed = parseManual(body, known, new Date());
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const { error } = await supabase
    .from('ai_usage_snapshots')
    .upsert({ ...parsed.row, user_id: user.id }, { onConflict: MANUAL_CONFLICT });
  if (error) {
    // A Postgres data exception (22xxx: out of range, bad format) is bad input, not a server fault.
    if (error.code?.startsWith('22')) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const status = isMissingRelation(error) ? 503 : 500;
    const message = isMissingRelation(error) ? 'Usage tables are not set up yet' : error.message;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
