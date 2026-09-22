import { NextRequest, NextResponse } from 'next/server';

import { today as appToday } from '@/lib/day';
import { collectInto, ensureCycle } from '@/lib/reviews/collect';
import { isCycleKind, periodToReview, type CycleKind } from '@/lib/reviews/periods';
import { unitLabelFor, verdictFor } from '@/lib/reviews/status';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Review cycle actions.
 *
 * Everything numeric is recomputed on the server from the underlying tables.
 * Nothing the client sends can set a status directly — a color that could be
 * posted is a color that means nothing, and the whole value of this module is
 * that the reading and the judgement come from different places.
 *
 * The one number a client may send is a `manual` area's value, and even then
 * the status is derived here from that area's own line.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  // -------------------------------------------------------------------------
  // open — make sure a cycle exists for the period under review, and score it.
  // -------------------------------------------------------------------------
  if (action === 'open') {
    const kind: CycleKind = isCycleKind(body?.kind) ? body.kind : 'weekly';
    // `periodToReview` hands back last period on the first morning of a new
    // one, so opening on Monday does not produce an empty week.
    const period = periodToReview(kind, appToday());

    try {
      const { id, created } = await ensureCycle(supabase, user.id, kind, period.start);
      const result = await collectInto(supabase, user.id, {
        id,
        kind,
        period_start: period.start,
        period_end: period.end,
      });
      return NextResponse.json({ ok: true, cycle_id: id, created, ...result });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // recompute — re-read every number for a cycle. Notes and actions survive.
  // -------------------------------------------------------------------------
  if (action === 'recompute') {
    const cycleId = typeof body?.cycle_id === 'string' ? body.cycle_id : null;
    if (!cycleId) return NextResponse.json({ error: 'cycle_id required' }, { status: 400 });

    const { data: cycle } = await supabase
      .from('review_cycles')
      .select('id,kind,period_start,period_end,status')
      .eq('id', cycleId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    // A closed cycle is a record of a judgement that was made. Rescoring it
    // months later against today's task board would rewrite history.
    if (cycle.status === 'closed') {
      return NextResponse.json({ error: 'That cycle is closed. Reopen it first.' }, { status: 409 });
    }

    try {
      const result = await collectInto(supabase, user.id, cycle);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // reading — his words, and the one number he enters by hand.
  // -------------------------------------------------------------------------
  if (action === 'reading') {
    const readingId = typeof body?.reading_id === 'string' ? body.reading_id : null;
    if (!readingId) return NextResponse.json({ error: 'reading_id required' }, { status: 400 });

    const { data: reading } = await supabase
      .from('review_readings')
      .select('id,area_key,unit,green_at,yellow_at,target_value,direction,detail,cycle_id,review_cycles!inner(status)')
      .eq('id', readingId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!reading) return NextResponse.json({ error: 'Reading not found' }, { status: 404 });

    const cycleStatus = (reading as { review_cycles?: { status?: string } }).review_cycles?.status;
    if (cycleStatus === 'closed') {
      return NextResponse.json({ error: 'That cycle is closed. Reopen it first.' }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body?.note_md === 'string') patch.note_md = body.note_md.trim() || null;
    if (typeof body?.action_md === 'string') patch.action_md = body.action_md.trim() || null;

    // A manual value rescored here, against this reading's own stored line —
    // not the area's current one, so raising a target next month cannot change
    // what this period was judged against.
    if ('value' in (body ?? {})) {
      const raw = body.value;
      const cleared = raw === null || raw === '';
      const value = cleared ? null : Number(raw);

      if (!cleared && !Number.isFinite(value)) {
        return NextResponse.json({ error: 'value must be a number' }, { status: 400 });
      }

      const verdict = verdictFor(
        { hasReading: !cleared, value: cleared ? null : (value as number) },
        {
          greenAt: reading.green_at === null ? null : Number(reading.green_at),
          yellowAt: reading.yellow_at === null ? null : Number(reading.yellow_at),
          targetValue: reading.target_value === null ? null : Number(reading.target_value),
          direction: reading.direction,
        },
        { unitLabel: unitLabelFor(reading.unit) }
      );

      patch.has_reading = !cleared;
      patch.value = cleared ? null : value;
      patch.status = verdict.status;
      patch.status_reason = verdict.reason;
      patch.detail = { ...(reading.detail ?? {}), entered: !cleared, enteredAt: new Date().toISOString() };
      patch.computed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('review_readings')
      .update(patch)
      .eq('id', readingId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A changed value can change the cycle's own color, so roll it back up.
    if ('value' in (body ?? {})) {
      const { data: siblings } = await supabase
        .from('review_readings')
        .select('status')
        .eq('cycle_id', reading.cycle_id);
      const statuses = (siblings ?? []).map((r: { status: string }) => r.status);
      const worst = statuses.includes('red')
        ? 'red'
        : statuses.includes('yellow')
          ? 'yellow'
          : statuses.some((s) => s === 'green')
            ? 'green'
            : null;
      await supabase
        .from('review_cycles')
        .update({ overall: worst, updated_at: new Date().toISOString() })
        .eq('id', reading.cycle_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // close / reopen — the verdict is filed, or taken back out.
  // -------------------------------------------------------------------------
  if (action === 'close' || action === 'reopen') {
    const cycleId = typeof body?.cycle_id === 'string' ? body.cycle_id : null;
    if (!cycleId) return NextResponse.json({ error: 'cycle_id required' }, { status: 400 });

    const closing = action === 'close';
    const patch: Record<string, unknown> = {
      status: closing ? 'closed' : 'open',
      closed_at: closing ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (typeof body?.summary_md === 'string') patch.summary_md = body.summary_md.trim() || null;

    const { error } = await supabase
      .from('review_cycles')
      .update(patch)
      .eq('id', cycleId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: patch.status });
  }

  // -------------------------------------------------------------------------
  // area — move a line.
  //
  // Only the LIVE definition moves. Readings already taken keep the line they
  // were judged against, which is why they copy it. Raising the training
  // target from 3 to 4 must not turn last month red retroactively.
  // -------------------------------------------------------------------------
  if (action === 'area') {
    const areaId = typeof body?.area_id === 'string' ? body.area_id : null;
    if (!areaId) return NextResponse.json({ error: 'area_id required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of ['green_at', 'yellow_at', 'target_value'] as const) {
      if (field in (body ?? {})) {
        const raw = body[field];
        if (raw === null || raw === '') patch[field] = null;
        else if (Number.isFinite(Number(raw))) patch[field] = Number(raw);
        else return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
      }
    }
    if (typeof body?.active === 'boolean') patch.active = body.active;
    if (typeof body?.label === 'string' && body.label.trim()) patch.label = body.label.trim();

    const { error } = await supabase
      .from('review_areas')
      .update(patch)
      .eq('id', areaId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
