/*
 * AI usage meter -> dispatch routing glue. Pure; tested in routing.test.mjs.
 *
 * usageJson(statuses, now): the machine-readable twin of open/ai-usage.txt,
 *   written to $BRAIN_ROOT/open/ai-usage.json by report.mjs --write. Read by
 *   dispatch-autostart (dev-harness) to route queued notes between Claude
 *   accounts (Eric, 2026-10-18 2:06 PM ET: meter-driven routing on).
 *
 * routingLine(jsonl, now): one brief line from the last 24h of
 *   $BRAIN_ROOT/runs/dispatch-routing.jsonl, e.g.
 *   "routing (24h): 2 jobs to 4lot (main at 72%); 1 held (main >= 90%)".
 */
const H = 3600000;

export function usageJson(statuses, now = new Date()) {
  const plans = {};
  for (const s of statuses) {
    const readingAt = s.readingAt ?? null;
    plans[s.slug] = {
      name: s.name,
      status: s.status,
      used_pct: s.pct ?? null,
      projected_at_reset_pct: s.projectedAtResetPct ?? null,
      runout_before_reset: !!s.beforeReset,
      reset_at: s.resetsAt ?? null,
      reading_at: readingAt,
      reading_age_h: readingAt ? Math.round(((now.getTime() - new Date(readingAt).getTime()) / H) * 10) / 10 : null,
      early: !!s.early,
      no_cap: !!s.noCap,
    };
  }
  return { generated_at: now.toISOString(), source: 'mission-control scripts/usage/report.mjs', version: 1, plans };
}

const PLAN_SHORT = { 'claude-max': 'main', 'claude-4lot': '4lot' };

export function routingLine(jsonl, now = new Date()) {
  const since = now.getTime() - 24 * H;
  const recs = [];
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at < since || at > now.getTime() + H) continue;
    if (r.action !== 'dispatch' && r.action !== 'hold') continue;
    recs.push(r);
  }
  if (!recs.length) return '';
  // One count per note: its latest decision in the window.
  const byNote = new Map();
  for (const r of recs) byNote.set(r.note ?? Math.random(), r);
  const counts = {};
  const reasons = {};
  for (const r of byNote.values()) {
    const k = r.action === 'hold' ? 'held' : `to ${PLAN_SHORT[r.plan] ?? r.plan}`;
    counts[k] = (counts[k] ?? 0) + 1;
    if (r.reason_short && !reasons[k]) reasons[k] = r.reason_short;
  }
  const order = (k) => (k === 'to 4lot' ? 0 : k === 'held' ? 2 : 1);
  const parts = Object.keys(counts).sort((a, b) => order(a) - order(b)).map((k) => {
    const n = counts[k];
    const what = k === 'held' ? `${n} held` : `${n} job${n === 1 ? '' : 's'} ${k}`;
    return reasons[k] ? `${what} (${reasons[k]})` : what;
  });
  return `routing (24h): ${parts.join('; ')}. Log: runs/dispatch-routing.jsonl`;
}
