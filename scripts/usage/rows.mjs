/*
 * AI usage meter: pure helpers the uploader uses (tested in rows.test.mjs).
 *   - attributeRows: cwd → project/client, then merge rows that land on the
 *     same unique key (two cwds of one project in one session-day).
 *   - parseManual: Chief of Staff's daily readings (JSONL) → manual rows.
 */
import { attribute, UNATTRIBUTED } from './attribution.mjs';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const UNIQUE_COLS = ['user_id', 'plan_slug', 'source', 'host', 'bot', 'session_id', 'project', 'day'];
const SUM = ['messages', 'tokens_in', 'tokens_out', 'tokens_cache_read', 'tokens_cache_write', 'tokens_total'];
const PCT = ['primary_used_pct', 'primary_window_minutes', 'primary_resets_at', 'secondary_used_pct', 'secondary_window_minutes', 'secondary_resets_at'];

const NUM = [...SUM, 'primary_used_pct', 'primary_window_minutes', 'secondary_used_pct', 'secondary_window_minutes'];
const STR = ['plan_slug', 'day', 'host', 'bot', 'session_id', 'model', 'primary_resets_at', 'secondary_resets_at', 'first_at', 'last_at'];
const PLAN_SLUGS = new Set(['claude-max', 'chatgpt-codex']);

/** Keep only known columns with the right types; null if the row is unusable. */
export function cleanLogRow(r) {
  if (!r || typeof r !== 'object' || !PLAN_SLUGS.has(r.plan_slug) || !DAY_RE.test(String(r.day ?? ''))) return null;
  const o = {};
  for (const c of STR) o[c] = typeof r[c] === 'string' ? r[c].slice(0, 200) : null;
  for (const c of NUM) {
    const n = r[c] === null || r[c] === undefined ? null : Number(r[c]);
    o[c] = n === null || !Number.isFinite(n) || n < 0 ? (SUM.includes(c) ? 0 : null) : n;
  }
  o.session_id = o.session_id ?? '';
  o.bot = o.bot ?? 'unknown';
  o.cwd = typeof r.cwd === 'string' ? r.cwd : null;
  o.repo = typeof r.repo === 'string' ? r.repo : null;
  return o;
}

/** Collector rows (with cwd) → DB rows (no cwd), keyed and merged. */
export function attributeRows(rows, map, userId) {
  const out = new Map();
  for (const raw of rows) {
    const r = cleanLogRow(raw);
    if (!r) continue;
    const { project, client } = attribute(r.cwd, map, r.repo);
    const { cwd: _cwd, repo: _repo, ...rest } = r;
    const row = { ...rest, source: 'log', host: raw.host, user_id: userId, project, client };
    const key = UNIQUE_COLS.map((c) => String(row[c] ?? '')).join('\u0000');
    const prev = out.get(key);
    if (!prev) { out.set(key, row); continue; }
    for (const c of SUM) prev[c] = (prev[c] ?? 0) + (row[c] ?? 0);
    if (row.last_at && (!prev.last_at || row.last_at > prev.last_at)) {
      for (const c of PCT) if (row[c] !== null && row[c] !== undefined) prev[c] = row[c];
      if (row.model) prev.model = row.model;
      prev.last_at = row.last_at;
    }
    if (row.first_at && (!prev.first_at || row.first_at < prev.first_at)) prev.first_at = row.first_at;
  }
  return [...out.values()];
}

function optNum(v, name, errs, lo = -Infinity, hi = Infinity) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) { errs.push(`${name} must be a number in [${lo}, ${hi}]`); return null; }
  return n;
}

/**
 * Manual readings, one JSON object per line. Blank lines and lines starting
 * with '#' are ignored. Fields:
 *   date (YYYY-MM-DD, ET, required), plan (slug, required),
 *   used_pct (0-100+, the % shown on the usage page), resets_at (ISO date or
 *   datetime), window ('5h'|'daily'|'weekly'|'monthly'),
 *   used, limit, unit (when the page shows a count instead of a %),
 *   secondary_used_pct, secondary_resets_at (a second meter, if shown),
 *   note, by (who entered it; default 'cos').
 * At least one of used_pct or used (with limit) is required; used/limit is
 * stored as a percent too. A later line for the same
 * plan, day and `by` replaces an earlier one.
 */
export function parseManual(text, { userId, planSlugs }) {
  const rows = new Map();
  const errors = [];
  const winMin = { '5h': 300, daily: 1440, weekly: 10080, monthly: 43200 };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const errs = [];
    let o;
    try { o = JSON.parse(line); } catch { errors.push(`line ${i + 1}: not JSON`); return; }
    if (!o || typeof o !== 'object') { errors.push(`line ${i + 1}: not an object`); return; }
    if (!DAY_RE.test(String(o.date ?? ''))) errs.push('date must be YYYY-MM-DD');
    if (!planSlugs.includes(o.plan)) errs.push(`plan must be one of ${planSlugs.join(', ')}`);
    const used_pct = optNum(o.used_pct, 'used_pct', errs, 0, 1000);
    const used = optNum(o.used, 'used', errs, 0);
    const limit = optNum(o.limit, 'limit', errs, 0);
    const sec = optNum(o.secondary_used_pct, 'secondary_used_pct', errs, 0, 1000);
    if (used_pct === null && used === null) errs.push('used_pct or used is required');
    if (used_pct === null && used !== null && !(limit > 0)) errs.push('used needs a positive limit');
    const resets = (v, name) => {
      if (!v) return null;
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) { errs.push(`${name} is not a date`); return null; }
      return d.toISOString();
    };
    const resets_at = resets(o.resets_at, 'resets_at');
    const sec_resets = resets(o.secondary_resets_at, 'secondary_resets_at');
    if (o.window !== undefined && !(o.window in winMin)) errs.push('window must be 5h|daily|weekly|monthly');
    if (errs.length) { errors.push(`line ${i + 1}: ${errs.join('; ')}`); return; }
    const by = typeof o.by === 'string' && o.by.trim() ? o.by.trim().slice(0, 40) : 'cos';
    const row = {
      user_id: userId, plan_slug: o.plan, source: 'manual', day: o.date, host: 'manual', bot: by,
      session_id: '', project: UNATTRIBUTED, client: null, model: null,
      messages: 0, tokens_in: 0, tokens_out: 0, tokens_cache_read: 0, tokens_cache_write: 0, tokens_total: 0,
      // A count reading becomes a percent so the forecast can use it.
      primary_used_pct: used_pct ?? (used !== null && limit > 0 ? Math.round((10000 * used) / limit) / 100 : null), primary_window_minutes: o.window ? winMin[o.window] : null, primary_resets_at: resets_at,
      secondary_used_pct: sec, secondary_window_minutes: null, secondary_resets_at: sec_resets,
      used_value: used, limit_value: limit, unit: typeof o.unit === 'string' ? o.unit.slice(0, 40) : null,
      note: typeof o.note === 'string' ? o.note.slice(0, 500) : null,
      first_at: null, last_at: null,
    };
    rows.set(`${o.plan}\u0000${o.date}\u0000${by}`, row);
  });
  return { rows: [...rows.values()], errors };
}

/**
 * Inbox files: keep the newest payload per host (by generated_at). Each one is
 * a complete recount of its window, so older ones are superseded, never added.
 * @returns {{ keep: object[], superseded: string[] }} keep carries .path
 */
export function newestPerHost(payloads) {
  const best = new Map();
  const superseded = [];
  for (const p of payloads) {
    const cur = best.get(p.host);
    if (!cur || String(p.generated_at) > String(cur.generated_at)) {
      if (cur) superseded.push(cur.path);
      best.set(p.host, p);
    } else superseded.push(p.path);
  }
  return { keep: [...best.values()], superseded };
}
