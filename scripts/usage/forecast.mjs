/*
 * AI usage meter: per-plan status for the morning brief and the run-out
 * alert (P3). Pure; tested in forecast.test.mjs. The page (src/lib/ai-usage)
 * renders the same idea for humans; this is the headless twin the timer uses.
 *
 * Status rules:
 *   grey   no reading in the last 48 hours
 *   red    projected to run out before the reset, or >= 90% used
 *   yellow >= 70% used, or projected run-out within 24h after the reset
 *   green  otherwise
 */
const H = 3600000;
const WINDOW_MIN = { '5h': 300, daily: 1440, weekly: 10080, monthly: 43200 };

/**
 * @param plan  mission.ai_plans row
 * @param rows  mission.ai_usage_snapshots rows for this plan (any order)
 * @param now   Date
 */
export function planStatus(plan, rows, now = new Date()) {
  const t = now.getTime();
  const fresh = (r) => r.captured_at && t - new Date(r.last_at ?? r.captured_at).getTime() <= 48 * H;
  const byLatest = (a, b) => String(b.last_at ?? b.day).localeCompare(String(a.last_at ?? a.day)) || String(b.captured_at).localeCompare(String(a.captured_at));

  // 1. A vendor percent: manual reading (newest), else Codex's weekly meter.
  const manual = rows.filter((r) => r.source === 'manual' && r.primary_used_pct != null).sort((a, b) => b.day.localeCompare(a.day) || String(b.captured_at).localeCompare(String(a.captured_at)));
  const logPct = rows.filter((r) => r.source === 'log' && (r.secondary_used_pct != null || r.primary_used_pct != null)).sort(byLatest);
  let reading = null;
  if (manual[0] && t - new Date(`${manual[0].day}T23:59:59-04:00`).getTime() <= 48 * H) {
    const m = manual[0];
    reading = { pct: Number(m.primary_used_pct), resetsAt: m.primary_resets_at, windowMin: m.primary_window_minutes ?? WINDOW_MIN[plan.reset_cadence], basis: 'manual reading', estimate: false };
  } else if (logPct[0] && fresh(logPct[0])) {
    const r = logPct[0];
    const useSec = r.secondary_used_pct != null;
    reading = {
      pct: Number(useSec ? r.secondary_used_pct : r.primary_used_pct),
      resetsAt: useSec ? r.secondary_resets_at : r.primary_resets_at,
      windowMin: (useSec ? r.secondary_window_minutes : r.primary_window_minutes) ?? WINDOW_MIN[plan.reset_cadence],
      basis: useSec ? 'CLI weekly meter' : 'CLI meter',
      estimate: false,
    };
  }

  // 2. Else a token budget (estimate) over the plan window.
  if (!reading && plan.limit_kind === 'tokens' && plan.limit_value) {
    const windowMin = WINDOW_MIN[plan.reset_cadence] ?? 10080;
    let start;
    let resetsAt;
    if (plan.reset_anchor) {
      const a = new Date(plan.reset_anchor).getTime();
      const w = windowMin * 60000;
      const n = Math.floor((t - a) / w);
      start = a + n * w;
      resetsAt = new Date(start + w).toISOString();
    } else {
      start = t - windowMin * 60000; // rolling window
      resetsAt = null;
    }
    const startDay = new Date(start).toISOString().slice(0, 10);
    const inWin = rows.filter((r) => r.source === 'log' && r.day >= startDay);
    if (!inWin.some(fresh)) return { slug: plan.slug, name: plan.name, status: 'grey', line: `${plan.name}: no usage logged in 48h` };
    const used = inWin.reduce((s, r) => s + Number(r.tokens_total || 0), 0);
    reading = { pct: (100 * used) / Number(plan.limit_value), resetsAt, windowMin, basis: plan.reset_anchor ? 'tokens vs budget' : 'rolling 7-day tokens vs budget', estimate: !!plan.limit_is_estimate, rolling: !plan.reset_anchor };
  }
  if (!reading) return { slug: plan.slug, name: plan.name, status: 'grey', line: `${plan.name}: no reading in 48h${plan.slug === 'grok-ultra' ? ' (manual entry owed by Chief of Staff)' : ''}` };

  const pct = Math.round(reading.pct * 10) / 10;
  let burnPerDay = null;
  let runOut = null;
  let resets = reading.resetsAt ? new Date(reading.resetsAt) : null;
  if (reading.windowMin) {
    const w = reading.windowMin * 60000;
    const start = resets ? resets.getTime() - w : t - w;
    const elapsed = Math.max(H, t - start);
    burnPerDay = (reading.pct / elapsed) * 24 * H;
    if (reading.rolling) {
      // Rolling window: burn is the window average, run-out is "at this pace".
      burnPerDay = reading.pct / (reading.windowMin / 1440);
    }
    if (reading.pct >= 100) runOut = now;
    else if (burnPerDay > 0) runOut = new Date(t + ((100 - reading.pct) / burnPerDay) * 24 * H);
  }
  let status = 'green';
  const beforeReset = runOut && resets && runOut < resets;
  if (pct >= 90 || beforeReset) status = 'red';
  else if (pct >= 70 || (runOut && resets && runOut.getTime() - resets.getTime() < 24 * H)) status = 'yellow';

  const fmt = (d) => d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const parts = [`${plan.name}: ${pct}% used${reading.estimate ? ' (estimate)' : ''}`];
  if (burnPerDay != null) parts.push(`${Math.round(burnPerDay * 10) / 10}%/day`);
  if (resets) parts.push(`resets ${fmt(resets)} ET`);
  if (beforeReset) parts.push(`projected to run out ${fmt(runOut)} ET, before reset`);
  const line = `${status.toUpperCase()} · ${parts.join(' · ')} [${reading.basis}]`;
  return { slug: plan.slug, name: plan.name, status, pct, burnPerDay, resetsAt: resets?.toISOString() ?? null, runOutAt: runOut?.toISOString() ?? null, runsOutBeforeReset: !!beforeReset, line };
}
