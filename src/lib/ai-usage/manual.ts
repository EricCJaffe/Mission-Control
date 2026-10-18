/*
 * Validation for a reading typed into the /ai-usage form. Pure, so the route
 * stays a thin auth + upsert and this can be tested.
 *
 * The row it produces is `source='manual', host='manual', bot='manual-form'`,
 * session '' and project 'unattributed' (a reading off a vendor usage page
 * belongs to the plan, not to any project, and carries no tokens). The
 * percent goes in `primary_used_pct` with its reset in `primary_resets_at`;
 * forecast.ts reads `secondary ?? primary`, so it is picked up as the plan's
 * reading. One row per plan per day: a second entry the same day replaces it.
 */

import { UNATTRIBUTED } from './types.ts';

export const MANUAL_CONFLICT = 'user_id,plan_slug,source,host,bot,session_id,project,day';

export type ManualRow = {
  plan_slug: string;
  source: 'manual';
  day: string;
  host: 'manual';
  bot: 'manual-form';
  session_id: '';
  project: typeof UNATTRIBUTED;
  primary_used_pct: number | null;
  primary_resets_at: string | null;
  used_value: number | null;
  limit_value: number | null;
  unit: string | null;
  note: string | null;
  captured_at: string;
};

const optNum = (v: unknown): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'bad';
};

const optText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function parseManual(
  body: unknown,
  knownPlans: string[],
  now: Date,
): { ok: true; row: ManualRow } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' };
  const b = body as Record<string, unknown>;

  const plan = typeof b.plan === 'string' ? b.plan.trim() : '';
  if (!knownPlans.includes(plan)) return { ok: false, error: 'Unknown plan' };

  const day = typeof b.day === 'string' ? b.day : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    return { ok: false, error: 'day must be YYYY-MM-DD' };
  }

  const pct = optNum(b.used_pct);
  const used = optNum(b.used_value);
  const limit = optNum(b.limit_value);
  if (pct === 'bad' || used === 'bad' || limit === 'bad') return { ok: false, error: 'Numbers must be zero or more' };
  if (pct !== null && pct > 1000) return { ok: false, error: 'used % looks wrong' };
  if (pct === null && (used === null || !limit)) {
    return { ok: false, error: 'Enter used %, or both used and limit' };
  }

  let resetsAt: string | null = null;
  if (b.resets_at !== undefined && b.resets_at !== null && b.resets_at !== '') {
    const t = Date.parse(String(b.resets_at));
    if (Number.isNaN(t)) return { ok: false, error: 'resets at is not a date' };
    resetsAt = new Date(t).toISOString();
  }

  return {
    ok: true,
    row: {
      plan_slug: plan,
      source: 'manual',
      day,
      host: 'manual',
      bot: 'manual-form',
      session_id: '',
      project: UNATTRIBUTED,
      primary_used_pct: pct,
      primary_resets_at: resetsAt,
      used_value: used,
      limit_value: limit,
      unit: optText(b.unit, 40),
      note: optText(b.note, 500),
      captured_at: now.toISOString(),
    },
  };
}
