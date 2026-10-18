import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildUsageCsv, isMonth, monthRange } from '@/lib/ai-usage/csv';
import { loadUsage } from '@/lib/ai-usage/load';

export const dynamic = 'force-dynamic';

/*
 * GET /api/ai-usage/export?month=YYYY-MM
 *
 * The monthly per-client CSV: one row per (plan, project) with percent of
 * that plan's month, plus each plan's unattributed row. RLS scopes it to the
 * signed-in user; nothing here uses the service role.
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const month = new URL(req.url).searchParams.get('month');
  if (!isMonth(month)) {
    return NextResponse.json({ ok: false, error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const { from, to } = monthRange(month);
  const load = await loadUsage(supabase, from, to);
  if (load.error) return NextResponse.json({ ok: false, error: load.error }, { status: 500 });
  if (load.truncated) {
    return NextResponse.json({ ok: false, error: 'Too many rows for one export; narrow the collector grain' }, { status: 500 });
  }

  const csv = buildUsageCsv(month, load.plans.map((p) => p.slug), load.rows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ai-usage-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
