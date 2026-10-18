/*
 * AI usage meter: per-plan status for the morning brief and the run-out
 * alert (P3). Pure; tested in forecast.test.mjs. The page (src/lib/ai-usage)
 * renders the same idea for humans; this is the headless twin the timer uses.
 *
 * Status rules (thresholds in config/ai-usage-thresholds.json, same as the page):
 *   grey   no reading in the last 48 hours
 *   early  first ~day / 15% of the window: green "too early to forecast",
 *          red only at >= 80% used
 *   red    >= 90% used, or run-out before the reset AND >= 25% used
 *   yellow >= 70% used, run-out before reset under 25%, or within 24h after
 *   green  otherwise
 */
import { etDay } from './collect-logs.mjs';
import { etNoon } from './rows.mjs';
import { createRequire } from 'node:module';

const T = createRequire(import.meta.url)('../../config/ai-usage-thresholds.json');

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
  const meterAt = (r) => r.meter_at ?? r.last_at ?? r.day;
  const freshMeter = (r) => t - new Date(meterAt(r)).getTime() <= 48 * H;
  const byLatest = (a, b) => String(meterAt(b)).localeCompare(String(meterAt(a))) || String(b.captured_at).localeCompare(String(a.captured_at));

  // A reading belongs to the allowance window it was taken in: once its
  // reset has passed it says nothing about the new window.
  const expired = (resetsAt) => resetsAt && new Date(resetsAt).getTime() <= t;

  // 1. A vendor percent: manual reading (newest), else Codex's weekly meter.
  // Manual readings count only when they measure the plan's own window (or
  // say nothing about the window); a 5h reading never stands for a week.
  // Between a manual reading and a CLI meter, the newer OBSERVATION wins, and
  // neither counts once it is older than 48h or its window has reset.
  const planWin = WINDOW_MIN[plan.reset_cadence];
  const weeklyOnly = plan.reset_cadence !== '5h';
  const candidates = [];
  for (const m of rows) {
    if (m.source !== 'manual' || m.primary_used_pct == null) continue;
    if (m.primary_window_minutes != null && m.primary_window_minutes !== planWin) continue;
    const at = m.meter_at ?? etNoon(m.day);
    if (t - new Date(at).getTime() > 48 * H || expired(m.primary_resets_at)) continue;
    candidates.push({ at, captured: m.captured_at, reading: { pct: Number(m.primary_used_pct), resetsAt: m.primary_resets_at, windowMin: m.primary_window_minutes ?? planWin, basis: 'manual reading', estimate: false, at } });
  }
  for (const r of rows) {
    if (r.source !== 'log') continue;
    const useSec = r.secondary_used_pct != null;
    if (!useSec && (weeklyOnly || r.primary_used_pct == null)) continue;
    if (!freshMeter(r) || expired(useSec ? r.secondary_resets_at : r.primary_resets_at)) continue;
    candidates.push({ at: meterAt(r), captured: r.captured_at, reading: {
      pct: Number(useSec ? r.secondary_used_pct : r.primary_used_pct),
      resetsAt: useSec ? r.secondary_resets_at : r.primary_resets_at,
      windowMin: (useSec ? r.secondary_window_minutes : r.primary_window_minutes) ?? planWin,
      basis: useSec ? 'CLI weekly meter' : 'CLI meter', estimate: false, at: meterAt(r),
    } });
  }
  candidates.sort((x, y) => String(y.at).localeCompare(String(x.at)) || String(y.captured).localeCompare(String(x.captured)));
  let reading = candidates[0]?.reading ?? null;

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
    const startDay = etDay(new Date(start).toISOString());
    const inWin = rows.filter((r) => r.source === 'log' && r.day >= startDay);
    if (!inWin.some(fresh)) return { slug: plan.slug, name: plan.name, status: 'grey', line: `${plan.name}: no usage logged in 48h` };
    const used = inWin.reduce((s, r) => s + Number(r.tokens_total || 0), 0);
    reading = { pct: (100 * used) / Number(plan.limit_value), resetsAt, windowMin, basis: plan.reset_anchor ? 'tokens vs budget' : 'rolling 7-day tokens vs budget', estimate: !!plan.limit_is_estimate, rolling: !plan.reset_anchor, tokens: true };
  }
  if (!reading && plan.limit_kind === 'tokens' && !plan.limit_value) {
    const since7 = etDay(new Date(t - 6 * 24 * H).toISOString());
    const tok = rows.filter((r) => r.source === 'log' && r.day >= since7).reduce((n, r) => n + Number(r.tokens_total || 0), 0);
    const fmtTok = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : String(n));
    return { slug: plan.slug, name: plan.name, status: 'grey', pct: null, noCap: true, line: `NO CAP KNOWN · ${plan.name}: ${fmtTok(tok)} tokens in the last 7 days (${fmtTok(Math.round(tok / 7))}/day); add a % reading from its usage page to forecast` };
  }
  if (!reading) return { slug: plan.slug, name: plan.name, status: 'grey', line: `${plan.name}: no current reading (none in 48h, or it reset since)${plan.slug === 'grok-ultra' ? ' (manual entry owed by Chief of Staff)' : ''}` };

  const pct = Math.round(reading.pct * 10) / 10;
  let burnPerDay = null;
  let runOut = null;
  let resets = reading.resetsAt ? new Date(reading.resetsAt) : null;
  let early = false;
  if (reading.windowMin) {
    const w = reading.windowMin * 60000;
    // Burn is measured up to when the reading was taken, and the run-out is
    // projected from that moment too (not from now), so an older reading is
    // not given extra time.
    const at = reading.at ? Math.min(t, new Date(reading.at).getTime()) : t;
    const start = resets ? resets.getTime() - w : at - w;
    // Same eligibility as the page: only a percent (meter/manual) reading.
    early = !reading.tokens && (at - start < w * T.earlyWindowFraction || at - start < Math.min(T.earlyMinHours * H, w / 2));
    // At least burnMinHours of window, so a first-hours spike is not the pace.
    const elapsed = Math.min(w, Math.max(T.burnMinHours * H, at - start));
    burnPerDay = (reading.pct / elapsed) * 24 * H;
    if (reading.rolling) {
      // Rolling window: burn is the window average, run-out is "at this pace".
      burnPerDay = reading.pct / (reading.windowMin / 1440);
    }
    if (reading.pct >= 100) runOut = now;
    else if (burnPerDay > 0) runOut = new Date((reading.rolling ? t : at) + ((100 - reading.pct) / burnPerDay) * 24 * H);
  }
  let status = 'green';
  // A rolling window (no reset instant) alerts once it is at or over budget.
  const beforeReset = (runOut && resets && runOut < resets) || (reading.rolling && reading.pct >= 100);
  const afterSoon = runOut && resets && runOut.getTime() - resets.getTime() <= T.yellowAfterResetHours * H;
  if (pct >= T.redAtPct) status = 'red';
  else if (early) status = pct >= T.earlyRedAtPct ? 'red' : pct >= T.yellowAtPct ? 'yellow' : 'green';
  else if (beforeReset && (reading.rolling || pct >= T.runOutRedFloorPct)) status = 'red';
  else if (pct >= T.yellowAtPct || beforeReset || afterSoon) status = 'yellow';
  const alarm = status === 'red' && !!beforeReset;

  const fmt = (d) => d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const parts = [`${plan.name}: ${pct}% used${reading.estimate ? ' (estimate)' : ''}`];
  if (burnPerDay != null) parts.push(`${Math.round(burnPerDay * 10) / 10}%/day`);
  if (resets) parts.push(`resets ${fmt(resets)} ET`);
  if (early && status !== 'red') parts.push('too early in the window to forecast');
  else if (beforeReset && resets) parts.push(`projected to run out ${fmt(runOut)} ET, before reset`);
  else if (beforeReset) parts.push('at or over the estimated weekly budget');
  const line = `${status.toUpperCase()} · ${parts.join(' · ')} [${reading.basis}]`;
  // For dispatch routing (open/ai-usage.json): where this pace lands at the
  // reset, projected from when the reading was taken (same basis as runOut).
  const readingAt = reading.at ? new Date(Math.min(t, new Date(reading.at).getTime())) : now;
  const projectedAtResetPct = burnPerDay != null && resets
    ? Math.round((reading.pct + burnPerDay * Math.max(0, resets.getTime() - readingAt.getTime()) / (24 * H)) * 10) / 10
    : null;
  return { slug: plan.slug, name: plan.name, status, pct, burnPerDay, resetsAt: resets?.toISOString() ?? null, runOutAt: runOut?.toISOString() ?? null, runsOutBeforeReset: alarm, beforeReset: !!beforeReset && !early, early, readingAt: readingAt.toISOString(), projectedAtResetPct, noCap: false, line };
}
