/*
 * How healthy is the Apple Health feed?
 *
 * Apple Health cannot be pulled. HealthKit has no server API, so nothing
 * reaches this app unless Health Auto Export on the phone pushes it — which is
 * why there is no "sync Apple Health" cron and never can be, while Withings
 * (a real OAuth API) has one.
 *
 * What that leaves is silence as the only failure mode, and silence is exactly
 * what nobody notices. The feed stopped on 2026-08-16 and was found three weeks
 * later, with not one server-side error in between: every payload that arrived
 * was written successfully, and then none arrived. This module turns that
 * silence into something a cron can alert on and a settings page can show.
 *
 * Pure functions over rows, so both callers agree on what "stale" means and it
 * can be tested without a database.
 */

/**
 * How long the feed may go quiet before it is called stale.
 *
 * Two days rather than one: the automations are not guaranteed daily, and a
 * watchdog that cries on any quiet Sunday gets muted, which would leave us
 * exactly where we started.
 */
export const STALE_AFTER_HOURS = 48;

/**
 * The payload ceiling, measured against production on 2026-09-08.
 *
 * Vercel rejects a request body over roughly 4.5 MB with a 413 BEFORE the
 * handler runs — 4.1 MB reached our auth check, 6.1 MB did not. So an oversized
 * payload writes no sync log, records no error, and is invisible from this side.
 *
 * That makes it self-perpetuating, which is the part worth understanding.
 * Health Auto Export sends everything since its last SUCCESSFUL delivery, so
 * each rejection widens the window and makes the next attempt larger. The feed
 * stopped on 2026-08-03; by September it was trying to push five weeks at once
 * and could never again fit. The export reaches 100% on the phone and then
 * fails to upload, which is why the automation's date never advances.
 *
 * Confirmed from the phone on 2026-09-08: Health Auto Export's own activity log
 * shows "Request failed (HTTP 413)" against a run that had otherwise finished,
 * alongside a 68-second query for Resting Energy. Fine-grained energy samples
 * over a five-week window are most of the weight, which is why summarising or
 * coarsening the time grouping shrinks a payload far more than dropping days.
 *
 * The permanent fix is Health Auto Export's "Batch Requests" setting, which
 * splits an export across several smaller requests so no single one can reach
 * the cap. Summarising and coarser grouping only shrink the payload; batching
 * removes the ceiling. Everything the ingest route writes is keyed and
 * idempotent — workouts on (user_id, apple_workout_id), metrics on their date,
 * cardio deleted then reinserted per workout, routes on workout_log_id — so
 * batches that overlap, or a range re-sent, update in place.
 *
 * Nothing here can catch a request that never arrived, which is why this is
 * documented rather than detected.
 */
export const MAX_PAYLOAD_MB = 4.5;

export type SyncLogRow = {
  received_at: string;
  status: string | null;
  automation_name: string | null;
  workouts_written: number | null;
  body_metrics_written: number | null;
  daily_written: number | null;
  error_message: string | null;
  metrics_unmapped: string[] | null;
};

export type AutomationHealth = {
  /** As named in Health Auto Export. Null when the app did not send one. */
  name: string;
  lastAt: string;
  ageHours: number;
  stale: boolean;
  lastStatus: string;
  /** Rows written by that automation's most recent payload. */
  lastWrote: number;
};

export type AppleHealthStatus = {
  everSynced: boolean;
  lastAt: string | null;
  ageHours: number | null;
  stale: boolean;
  /** Per Health Auto Export automation, newest first. */
  automations: AutomationHealth[];
  /** Payloads that reported partial or error, newest first, capped. */
  problems: Array<{ receivedAt: string; status: string; message: string }>;
  /** Metric names the phone sent that nothing here maps yet. */
  unmapped: string[];
  payloads: number;
};

function hoursBetween(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

export function summariseAppleHealth(
  rows: SyncLogRow[],
  now: Date = new Date(),
  staleAfterHours: number = STALE_AFTER_HOURS,
): AppleHealthStatus {
  if (rows.length === 0) {
    return {
      everSynced: false,
      lastAt: null,
      ageHours: null,
      // Never having synced is a setup problem, not a staleness one. Reporting
      // it as "stale" would send a watchdog email to someone who has not
      // connected the phone yet.
      stale: false,
      automations: [],
      problems: [],
      unmapped: [],
      payloads: 0,
    };
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  );

  const newest = sorted[0]!;
  const ageHours = hoursBetween(newest.received_at, now);

  // One entry per automation, from its most recent payload. An automation that
  // has quietly stopped while the others keep running is the failure this is
  // built to surface — an overall "last sync" figure hides it completely.
  const byAutomation = new Map<string, SyncLogRow>();
  for (const row of sorted) {
    const name = row.automation_name ?? 'Unnamed';
    if (!byAutomation.has(name)) byAutomation.set(name, row);
  }

  const automations: AutomationHealth[] = [...byAutomation.entries()].map(([name, row]) => {
    const age = hoursBetween(row.received_at, now);
    return {
      name,
      lastAt: row.received_at,
      ageHours: age,
      stale: age > staleAfterHours,
      lastStatus: row.status ?? 'unknown',
      lastWrote:
        (row.workouts_written ?? 0) +
        (row.body_metrics_written ?? 0) +
        (row.daily_written ?? 0),
    };
  });

  const problems = sorted
    .filter((r) => r.status !== 'success' || r.error_message)
    .slice(0, 5)
    .map((r) => ({
      receivedAt: r.received_at,
      status: r.status ?? 'unknown',
      message: r.error_message ?? 'no detail recorded',
    }));

  const unmapped = [...new Set(sorted.flatMap((r) => r.metrics_unmapped ?? []))].sort();

  return {
    everSynced: true,
    lastAt: newest.received_at,
    ageHours,
    stale: ageHours > staleAfterHours,
    automations,
    problems,
    unmapped,
    payloads: rows.length,
  };
}

/** "3 weeks", "2 days", "5 hours" — for an alert subject line and the panel. */
export function describeAge(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

/**
 * Should the watchdog email today?
 *
 * The cron runs daily, so alerting on every stale run would have sent about
 * nineteen identical emails during the August outage — and an alert that
 * arrives every morning is one you filter, which puts you back where you
 * started. This fires on the second day and then weekly: day 2, 7, 14, 21.
 */
export function shouldAlert(
  ageHours: number,
  staleAfterHours: number = STALE_AFTER_HOURS,
): boolean {
  if (ageHours <= staleAfterHours) return false;
  const days = Math.floor(ageHours / 24);
  return days === 2 || (days > 0 && days % 7 === 0);
}
