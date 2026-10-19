import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/supabase/schema';
import { generateBrief } from '@/lib/brief/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The weekly and daily brief.
 *
 * Weekly Sunday 23:00 UTC, daily Mon–Fri 10:30 UTC; both are wired in
 * vercel.json and both land here with ?kind=.
 *
 * STORE, NEVER SEND. The brief is written to mission.briefs and that is all
 * this route does. Until 2026-10-19 ?send=1 mailed it through Graph as
 * eric@ -> eric@; Eric, 2026-10-19 10:52 AM ET (via Chief of Staff): every
 * email to him comes from a Grok Bot address so a reply reaches a bot. So
 * ?send=1 now marks the stored row for handoff, and the brain-side pull
 * (/api/cron/brief-outbox) routes it through brief-via-grokbot.py, which
 * owns the Sabbath hold. See src/lib/brief/outbox.ts.
 *
 * Fail-closed on the secret, like the other crons here.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.MC_USER_ID;

  if (!secret || !supabaseUrl || !serviceKey || !userId) {
    const missing = [
      ['CRON_SECRET', secret],
      ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
      ['MC_USER_ID', userId],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    return NextResponse.json(
      {
        error: 'The brief cron is not configured on this deployment.',
        missing_env: missing,
        hint: 'Set these for Production in Vercel, then redeploy.',
      },
      { status: 503 },
    );
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind') ?? 'daily';
  if (kindParam !== 'daily' && kindParam !== 'weekly') {
    return NextResponse.json({ error: "kind must be 'daily' or 'weekly'" }, { status: 400 });
  }
  const kind: 'daily' | 'weekly' = kindParam;
  // A dry run generates and stores nothing — for checking the shape by hand.
  const preview = url.searchParams.get('preview') === '1';

  /*
   * ?send=1 — hand this brief to grokbot to mail. Without it, store only.
   *
   * Eric, 2026-09-15: "Chief of staff should be running things."
   *
   * Until then two daily briefs arrived every weekday: this one at 06:30 and
   * the chief-of-staff brief at 06:00, with near-identical subjects — "Daily
   * brief — 2026-09-15" here, "daily-brief — 2026-09-15" there. On the day
   * the chief-of-staff brief failed to send, Eric received this one, assumed
   * it was his, and reported that the format had changed. Two senders for
   * one job is a guarantee of that confusion.
   *
   * This brief is NOT retired. It still generates and stores on every run,
   * it is still the thing that computes the alignment check and prep
   * warnings, and /briefs still renders it. The chief-of-staff brief now
   * reads that stored payload rather than recomputing the matrix maths a
   * second way — which is how this code and PriorityMatrix.tsx disagreed
   * once already.
   *
   * It stays callable WITH ?send=1 as the failure backstop: if the
   * chief-of-staff brief cannot deliver, run-job.sh calls this so Eric is
   * never left with no brief at all. Since 2026-10-19 that queues the row
   * for the grokbot outbox rather than mailing it as eric@.
   */
  const send = url.searchParams.get('send') === '1';

  const supabase = createClient(supabaseUrl, serviceKey, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let brief;
  try {
    brief = await generateBrief({ supabase, userId, kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/brief] generation failed:', message);
    return NextResponse.json({ error: 'Could not generate the brief', detail: message }, { status: 500 });
  }

  if (preview) {
    return new NextResponse(brief.html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const { data: stored, error: storeError } = await supabase
    .from('briefs')
    .insert({
      user_id: userId,
      kind,
      period_start: brief.periodStart,
      period_end: brief.periodEnd,
      html: brief.html,
      stats: brief.stats,
    })
    .select('id')
    .single();

  if (storeError || !stored) {
    console.error('[cron/brief] could not store the brief:', storeError?.message);
    return NextResponse.json({ error: 'Could not store the brief' }, { status: 500 });
  }

  const subject =
    kind === 'weekly'
      ? `Weekly brief — week of ${brief.periodStart}`
      : `Daily brief — ${brief.periodStart}`;

  if (!send) {
    await supabase.from('briefs').update({ subject }).eq('id', stored.id);
    return NextResponse.json({
      ok: true,
      id: stored.id,
      sent: false,
      reason: 'stored only — the chief-of-staff brief is the sender; call with ?send=1 as a backstop',
    });
  }

  const { error: queueError } = await supabase
    .from('briefs')
    .update({ subject, handoff_requested_at: new Date().toISOString() })
    .eq('id', stored.id);

  // The backstop exists for the day the other brief failed, so a backstop
  // that could not queue must say so: 500, and run-job.sh sees it. The row is
  // already stored, so a retry is a second row for the period, not a lost one.
  if (queueError) {
    console.error('[cron/brief] stored but could not queue for grokbot:', queueError.message);
    return NextResponse.json(
      { ok: false, id: stored.id, sent: false, error: 'Stored, but could not queue for grokbot', detail: queueError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: stored.id,
    kind,
    period: [brief.periodStart, brief.periodEnd],
    sent: false,
    queued: true,
    via: 'grokbot',
  });
}
