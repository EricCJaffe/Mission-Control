import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/supabase/schema';
import { sendMail } from '@/lib/graph/sendMail';
import {
  summariseAppleHealth,
  describeAge,
  shouldAlert,
  MAX_PAYLOAD_MB,
  STALE_AFTER_HOURS,
  type SyncLogRow,
} from '@/lib/fitness/apple-health-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The Apple Health watchdog. Daily, from vercel.json.
 *
 * IT DOES NOT SYNC ANYTHING, AND CANNOT. HealthKit has no server API: data
 * only leaves the phone when Health Auto Export pushes it to
 * /api/fitness/apple-health/ingest. Withings has a real OAuth API and so has a
 * real sync cron; there is no equivalent to call for Apple, and a job that
 * claimed to "sync Apple Health" would be a job that did nothing.
 *
 * What it does is watch for silence. The feed stopped on 2026-08-16 and was
 * noticed on 2026-09-08 — three weeks, with every payload before it reporting
 * success and no error anywhere. Silence was the only symptom and nothing was
 * looking for it.
 *
 * Fail-closed on the secret and service-role for the read, matching the other
 * crons here — a cookie client has no session inside a cron and RLS would
 * return nothing, which is a failure that looks exactly like "all healthy".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.APPLE_HEALTH_USER_ID ?? process.env.MC_USER_ID;

  if (!secret || !supabaseUrl || !serviceKey || !userId) {
    const missing = [
      ['CRON_SECRET', secret],
      ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
      ['APPLE_HEALTH_USER_ID or MC_USER_ID', userId],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    return NextResponse.json(
      {
        error: 'The Apple Health watchdog is not configured on this deployment.',
        missing_env: missing,
        hint: 'Set these for Production in Vercel, then redeploy.',
      },
      { status: 503 },
    );
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 60 is enough to characterise the recent feed without reading a year of it.
  const { data, error } = await supabase
    .from('apple_health_sync_logs')
    .select(
      'received_at, status, automation_name, workouts_written, body_metrics_written, daily_written, error_message, metrics_unmapped',
    )
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const status = summariseAppleHealth((data ?? []) as SyncLogRow[]);

  // Never-synced is a setup state, not an outage — see summariseAppleHealth.
  if (!status.stale || status.ageHours === null) {
    return NextResponse.json({ ok: true, alerted: false, status });
  }

  if (!shouldAlert(status.ageHours)) {
    return NextResponse.json({ ok: true, alerted: false, throttled: true, status });
  }

  const admin = process.env.ADMIN_EMAIL;
  if (!admin) {
    return NextResponse.json({ ok: true, alerted: false, reason: 'ADMIN_EMAIL is not set', status });
  }

  const age = describeAge(status.ageHours);
  const stopped = status.automations
    .filter((a) => a.stale)
    .map((a) => `<li><strong>${a.name}</strong> — last sent ${describeAge(a.ageHours)} ago</li>`)
    .join('');

  const result = await sendMail({
    to: admin,
    subject: `Apple Health has been quiet for ${age}`,
    html: `
      <p>No Apple Health payload has reached Mission Control for <strong>${age}</strong>
      (last one ${new Date(status.lastAt!).toUTCString()}).</p>
      <p>Nothing is wrong on the server — every payload that has arrived was written
      successfully. Apple Health cannot be pulled, so this always means the phone
      did not deliver.</p>
      <p><strong>Most likely cause: the payload has grown too large.</strong> Health Auto
      Export sends everything since its last successful delivery, so after a gap it exceeds
      ${MAX_PAYLOAD_MB} MB and is rejected with a 413 before reaching the app — no log entry,
      no error, and the export still reads 100% on the phone because only the upload failed.
      Each failure widens the window, so it cannot recover on its own. Export a single day
      first to break the loop, then walk forward a week at a time.</p>
      ${stopped ? `<p>Automations that have gone quiet:</p><ul>${stopped}</ul>` : ''}
      <p>Open <strong>Health Auto Export</strong> on your iPhone, check those automations are
      still enabled and still have background permission, and run an export. iOS suspends
      background automations for apps it decides are unused, which is the usual cause.</p>
      <p>Status page: <a href="https://missioncontrol.bibleos.app/fitness/settings/apple-health">Fitness → Settings → Apple Health</a></p>
    `,
  });

  return NextResponse.json({
    ok: true,
    alerted: result.sent,
    mail: result,
    stale_after_hours: STALE_AFTER_HOURS,
    status,
  });
}
