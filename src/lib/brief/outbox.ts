/**
 * The outbox for mail to Eric.
 *
 * Eric, 2026-10-19 10:52 AM ET (via Chief of Staff): every email TO eric@
 * comes from a Grok Bot address, so a reply hands a bot the work. This app
 * used to send through Graph as eric@ -> eric@, where a reply landed in his
 * own Inbox and nothing read it.
 *
 * Nothing here sends. A message is a mission.briefs row with
 * handoff_requested_at set; the brain-side pull on ubuntu-dev reads
 * /api/cron/brief-outbox, routes each row through
 * jobs/lib/brief-via-grokbot.py (which owns the Sabbath hold), and acks it
 * with handed_off_at. Vercel cannot reach the brain checkout, so the pull is
 * the only shape that works.
 *
 * The one rule that matters: a failure to queue is returned, never swallowed.
 * A red alert that did not land here is a red alert nobody will ever see.
 */

export type Severity = 'red' | 'yellow' | 'green';

/** The slice of a Supabase client this file uses, so a test can fake it. */
export interface OutboxClient {
  from(table: 'briefs'): {
    insert(row: Record<string, unknown>): {
      select(cols: string): {
        single(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface AlertInput {
  userId: string;
  subject: string;
  html: string;
  severity: Severity;
  /** YYYY-MM-DD, Eric's day (src/lib/day.ts), for period_start/period_end. */
  day: string;
  stats?: Record<string, unknown>;
}

export type QueueResult = { ok: true; id: string } | { ok: false; error: string };

/** Store an alert and mark it for handoff. One insert, so it is all or nothing. */
export async function queueAlert(supabase: OutboxClient, input: AlertInput): Promise<QueueResult> {
  try {
    const { data, error } = await supabase
      .from('briefs')
      .insert({
        user_id: input.userId,
        kind: 'alert',
        severity: input.severity,
        subject: input.subject,
        period_start: input.day,
        period_end: input.day,
        html: input.html,
        stats: input.stats ?? null,
        handoff_requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'insert returned no row' };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The HTTP answer for a queue attempt. Anything but a stored row is a 500, so
 * Vercel's cron log and job-health see it; a 200 here would be the silent drop.
 */
export function queueResponse(result: QueueResult, extra: Record<string, unknown> = {}) {
  if (result.ok) {
    return { status: 200, body: { ok: true, alerted: true, queued: result.id, via: 'grokbot', ...extra } };
  }
  return {
    status: 500,
    body: { ok: false, alerted: false, error: 'Could not queue the alert for grokbot', detail: result.error, ...extra },
  };
}

/** What /briefs calls a row. Alerts live in the same table since 2026-10-19. */
export function kindLabel(kind: string): string {
  if (kind === 'weekly') return 'Weekly';
  if (kind === 'alert') return 'Alert';
  return 'Daily';
}

export interface DeliveryFields {
  sent_at: string | null;
  sent_to: string | null;
  handoff_requested_at?: string | null;
  handed_off_at?: string | null;
}

/**
 * Where a row's mail stands. `warn` only for a handoff still waiting: a
 * stored-only brief is the normal case now (the chief-of-staff brief is the
 * sender), so painting it as a failure would teach everyone to ignore it.
 */
export function deliveryStatus(row: DeliveryFields): { text: string; warn: boolean } {
  if (row.sent_at) return { text: `sent to ${row.sent_to ?? 'unknown'}`, warn: false };
  if (row.handed_off_at) return { text: 'handed to grokbot', warn: false };
  if (row.handoff_requested_at) return { text: 'waiting for grokbot', warn: true };
  return { text: 'stored only', warn: false };
}
