import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { MetricShiftDetector } from '@/lib/fitness/metric-shift-detector';

export const dynamic = 'force-dynamic';

/**
 * Daily Metric Check Cron Job
 * Runs daily at 6am to detect metric shifts and trigger health.md updates
 *
 * Setup in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/daily-metric-check",
 *     "schedule": "0 6 * * *"
 *   }]
 * }
 *
 * Or use Vercel Cron Jobs dashboard to configure
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret (if using Vercel Cron)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron] Starting daily metric check...');

    const supabase = await supabaseServer();

    // Get all users with active health documents
    const { data: users, error: usersError } = await supabase
      .from('health_documents')
      .select('user_id')
      .eq('is_current', true);

    if (usersError || !users) {
      console.error('[Cron] Failed to fetch users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
    console.log(`[Cron] Checking ${uniqueUserIds.length} users for metric shifts`);

    const detector = new MetricShiftDetector(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let totalShifts = 0;
    let totalUpdates = 0;

    for (const userId of uniqueUserIds) {
      try {
        // Detect shifts for this user
        const shifts = await detector.detectShifts(userId);

        if (shifts.length > 0) {
          console.log(`[Cron] User ${userId}: ${shifts.length} metric shifts detected`);
          totalShifts += shifts.length;

          // Trigger health.md update detection
          const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '') || 'http://localhost:3000';
          const response = await fetch(`${baseUrl}/api/fitness/health/detect-updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trigger: 'metric_shift',
              trigger_data: { shifts },
            }),
          });

          const data = await response.json();

          if (data.ok && data.updates_detected) {
            totalUpdates += data.pending_updates?.length || 0;
            console.log(`[Cron] User ${userId}: ${data.pending_updates?.length || 0} health.md updates pending`);
          }
        }
      } catch (userError) {
        console.error(`[Cron] Error processing user ${userId}:`, userError);
        // Continue with next user
      }
    }

    console.log(`[Cron] Daily metric check complete: ${totalShifts} shifts detected, ${totalUpdates} updates queued`);

    return NextResponse.json({
      success: true,
      users_checked: uniqueUserIds.length,
      shifts_detected: totalShifts,
      updates_queued: totalUpdates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Daily metric check error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
