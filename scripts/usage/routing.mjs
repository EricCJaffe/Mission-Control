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
 *
 * stallLine(jsonl, now): one brief line naming the queued notes auto-start
 *   gave up on in the last 24h (the prompts-per-day limit: a note prompted
 *   twice without being picked up), e.g.
 *   "auto-start stalled (24h): fsaos 2026-10-18-fsaos-brain-replan.md (prompted 2x today) · ..."
 *   A note dispatched again after its give-up drops off.
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

export function stallLine(jsonl, now = new Date()) {
  const since = now.getTime() - 24 * H;
  const recs = [];
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r !== 'object' || !r.note) continue;
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at < since || at > now.getTime() + H) continue;
    // Only a successful dispatch clears a stall; a failed launch leaves it.
    if (r.action !== 'give-up' && !(r.action === 'dispatch' && r.ok !== false)) continue;
    recs.push({ ...r, _t: at });
  }
  recs.sort((a, b) => a._t - b._t);
  const latest = new Map();
  for (const r of recs) latest.set(r.note, r);
  const stalled = [...latest.values()].filter((r) => r.action === 'give-up');
  if (!stalled.length) return '';
  const parts = stalled.map((r) => `${r.label ? `${r.label} ` : ''}${String(r.note).split('/').pop()}${r.reason_short ? ` (${r.reason_short})` : ''}`);
  return `auto-start stalled (24h): ${parts.join(' · ')}; grok-inbox escalates. Log: runs/dispatch-routing.jsonl`;
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
  const gated = new Set();
  // First-try metric v2 (dispatch-autostart --rescore, 2026-10-20): a `rescore`
  // record re-judges an earlier outcome (same note + dispatched_at). Outcome
  // records are never rewritten, so the newest rescore wins here.
  const fix = new Map();
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.includes('"rescore"')) continue;
    try { const r = JSON.parse(line); if (r?.action === 'rescore') fix.set(`${r.note}|${r.dispatched_at}`, r); } catch { /* skip */ }
  }
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
    if (r.action !== 'outcome') continue;
    const fx = fix.get(`${r.note}|${r.dispatched_at}`);
    if (fx) r = { ...r, first_try: fx.first_try, gated: fx.gated };
    if (r.first_try == null) {
      if (r.gated || r.result === 'needs-eric' || r.result === 'waiting') gated.add(r.note ?? line);
      continue;
    }
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
  if (gated.size) parts.push(`${gated.size} gated on Eric (not scored)`);
  return parts.length ? `routes (7d, first-try): ${parts.join(' · ')}` : '';
}
