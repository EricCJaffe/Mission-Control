import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/supabase/schema';
import { generateBrief } from '@/lib/brief/generate';
import { sendMail } from '@/lib/graph/sendMail';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The weekly and daily brief.
 *
 * Weekly Sunday 23:00 UTC, daily Mon–Fri 10:30 UTC; both are wired in
 * vercel.json and both land here with ?kind=.
 *
 * STORE FIRST, SEND SECOND, ALWAYS. The brief is written to mission.briefs
 * before a single call to Graph. Sending is the part most likely to fail —
 * an expired client secret, a missing Mail.Send grant, an Exchange policy that
 * does not list the mailbox — and a brief that generated but did not send is a
 * delivery problem you can fix and retry. One that was never written down is
 * simply gone, along with the week it described.
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

  const to = process.env.BRIEF_RECIPIENT || process.env.ADMIN_EMAIL || process.env.MS_MAILBOX;
  if (!to) {
    await supabase
      .from('briefs')
      .update({ send_error: 'No recipient configured (BRIEF_RECIPIENT, ADMIN_EMAIL or MS_MAILBOX).' })
      .eq('id', stored.id);
    return NextResponse.json({ ok: true, id: stored.id, sent: false, reason: 'no recipient configured' });
  }

  const subject =
    kind === 'weekly'
      ? `Weekly brief — week of ${brief.periodStart}`
      : `Daily brief — ${brief.periodStart}`;

  const result = await sendMail({ to, subject, html: brief.html });

  await supabase
    .from('briefs')
    .update(
      result.sent
        ? { sent_at: new Date().toISOString(), sent_to: to, send_error: null }
        : { send_error: result.reason },
    )
    .eq('id', stored.id);

  if (!result.sent) console.warn('[cron/brief] stored but not sent:', result.reason);

  // 200 either way: the brief exists and is readable at /briefs. Returning 500
  // would make Vercel retry and generate a duplicate for the same period.
  return NextResponse.json({
    ok: true,
    id: stored.id,
    kind,
    period: [brief.periodStart, brief.periodEnd],
    sent: result.sent,
    ...(result.sent ? {} : { reason: result.reason }),
  });
}
