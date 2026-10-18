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

export function usageJson(statuses, now = new Date(), { plans: planRows = [], capacity = null } = {}) {
  const plans = {};
  const cap = capacity?.plans ?? {};
  const limitOf = Object.fromEntries(planRows.map((p) => [p.slug, p.limit_kind === 'tokens' && p.limit_value ? Number(p.limit_value) : null]));
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
      idle: !!s.idle,
      limit_tokens: limitOf[s.slug] ?? null,
      capacity_weight: cap[s.slug]?.weight ?? null,
      overflow_target: cap[s.slug]?.overflow_target ?? null,
      small_jobs_only: !!cap[s.slug]?.small_jobs_only,
    };
  }
  return {
    generated_at: now.toISOString(),
    source: 'mission-control scripts/usage/report.mjs',
    version: 2,
    max_weekly_tokens_baseline: capacity?.max_weekly_tokens_baseline ?? null,
    job_size_tokens: capacity?.job_size_tokens ?? null,
    plans,
  };
}

const PLAN_SHORT = { 'claude-max': 'main', 'claude-4lot': '4lot' };

export function routingLine(jsonl, now = new Date()) {
  const since = now.getTime() - 24 * H;
  const recs = [];
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object') continue;
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at < since || at > now.getTime() + H) continue;
    if (r.action !== 'dispatch' && r.action !== 'hold') continue;
    recs.push(r);
  }
  if (!recs.length) return '';
  recs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
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

/*
 * routeScoreLine(jsonl, now): one weekly brief line from the outcome records
 * dispatch-autostart writes (research R2, Eric 2:20 PM ET 10/18), e.g.
 * "routes (7d, first-try): main/strong 8/9 (89%) · main/economy 3/5 (60%, below 80%: moves up a tier) · 1 escalated · 1 needs Eric".
 * Backfilled outcomes (history used for size estimates) are not scored.
 */
export function routeScoreLine(jsonl, now = new Date(), { floor = 0.8, minN = 5 } = {}) {
  const since = now.getTime() - 7 * 24 * H;
  const score = {};
  const esc = new Set();
  const eric = new Set();
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object') continue;
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at < since || at > now.getTime() + H) continue;
    if (r.backfill) continue;
    if (r.action === 'escalate') esc.add(r.note ?? line);
    if (r.action === 'needs-eric') eric.add(r.note ?? line);
    if (r.action !== 'outcome' || r.first_try == null) continue;
    const k = `${PLAN_SHORT[r.plan] ?? r.plan}/${r.tier ?? 'default'}`;
    score[k] ??= { n: 0, ok: 0 };
    score[k].n += 1;
    if (r.first_try) score[k].ok += 1;
  }
  const parts = Object.keys(score).sort().map((k) => {
    const { n, ok } = score[k];
    const pct = Math.round((100 * ok) / n);
    const low = n >= minN && ok / n < floor;
    return `${k} ${ok}/${n} (${pct}%${low ? `, below ${Math.round(floor * 100)}%: ${k.endsWith('/economy') ? 'moves up a tier' : 'review this route'}` : ''})`;
  });
  if (esc.size) parts.push(`${esc.size} escalated`);
  if (eric.size) parts.push(`${eric.size} needs Eric`);
  return parts.length ? `routes (7d, first-try): ${parts.join(' · ')}` : '';
}
