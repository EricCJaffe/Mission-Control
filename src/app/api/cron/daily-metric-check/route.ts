import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MetricShiftDetector } from '@/lib/fitness/metric-shift-detector';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily metric-shift check. Scheduled from vercel.json.
 *
 * Three things here are deliberate, because each was previously broken:
 *
 * 1. Auth is fail-CLOSED. It used to read
 *    `if (process.env.CRON_SECRET && authHeader !== ...)`, so an unset secret
 *    skipped the check entirely and left the route publicly callable.
 * 2. It uses the SERVICE-ROLE client. It previously used the cookie-based
 *    server client, which has no session inside a cron — RLS returned zero
 *    users on every run, so the job silently processed nobody at all.
 * 3. Follow-through runs IN-PROCESS. It used to POST to
 *    /api/fitness/health/detect-updates with a base URL derived from
 *    NEXT_PUBLIC_SUPABASE_URL — the Supabase host, not the app — and that
 *    route is cookie-authed regardless, so the call could never have
 *    succeeded. HealthDocUpdater takes a userId and its own service-role key,
 *    so it is invoked directly.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Explicit check first so TypeScript narrows these to strings below; the
  // list is only for the message.
  if (!secret || !supabaseUrl || !serviceKey) {
    const missing = [
      ['CRON_SECRET', secret],
      ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    return NextResponse.json(
      {
        error: 'Cron is not configured on this deployment.',
        missing_env: missing,
        hint: 'Set these for Production in Vercel, then redeploy.',
      },
      { status: 503 }
    );
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: docs, error: docsError } = await supabase
    .from('health_documents')
    .select('user_id')
    .eq('is_current', true);

  if (docsError) {
    console.error('[cron/daily-metric-check] failed to load users:', docsError.message);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const userIds = [...new Set((docs ?? []).map((d) => d.user_id as string))];
  const detector = new MetricShiftDetector(supabaseUrl, serviceKey);
  const updater = new HealthDocUpdater(supabaseUrl, serviceKey);

  let totalShifts = 0;
  let totalQueued = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    try {
      const shifts = await detector.detectShifts(userId);
      if (shifts.length === 0) continue;
      totalShifts += shifts.length;

      const updates = await updater.detectUpdates(userId, 'metric_shift', { shifts });
      if (updates.length === 0) continue;

      // Don't re-queue sections that are already waiting.
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const { data: recent } = await supabase
        .from('health_doc_pending_updates')
        .select('section_number')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('created_at', oneHourAgo);

      const alreadyPending = new Set((recent ?? []).map((r) => r.section_number));
      const fresh = updates.filter((u) => !alreadyPending.has(u.section_number));
      if (fresh.length === 0) continue;

      const ids = await updater.savePendingUpdates(userId, fresh);
      totalQueued += ids.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.error(`[cron/daily-metric-check] user ${userId}: ${message}`);
      // One user's failure must not abort the rest of the run.
      failures.push(userId);
    }
  }

  return NextResponse.json({
    ok: true,
    users_checked: userIds.length,
    shifts_detected: totalShifts,
    updates_queued: totalQueued,
    failed_users: failures.length,
  });
}
