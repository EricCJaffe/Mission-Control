/*
 * Who used each plan, as PERCENT of that plan's usage (Eric, 2026-10-18
 * 12:24 PM ET: percent of usage, not dollars; flat plans are not billed per
 * token, so a dollar share would be a fiction).
 *
 * `unattributed` is always its own row, even at zero. Folding it into the
 * others, or hiding it when small, would make the attribution look more
 * complete than it is, which is exactly what the config file exists to fix.
 */

import { UNATTRIBUTED, type AiUsageSnapshot } from './types.ts';

export type Share = {
  key: string;
  client: string | null;
  tokens: number;
  /** tokens ÷ plan tokens × 100 over the same rows; 0 when the plan has none. */
  percent: number;
  sessions: number;
  messages: number;
};

export type ShareKey = 'project' | 'bot' | 'host' | 'session_id' | 'model';

type Row = Pick<
  AiUsageSnapshot,
  'plan_slug' | 'day' | 'host' | 'bot' | 'session_id' | 'project' | 'client' | 'model' | 'tokens_total' | 'messages'
>;

export function inDays<T extends { day: string }>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => r.day >= from && r.day <= to);
}

export function shareBy(rows: Row[], key: ShareKey): Share[] {
  const total = rows.reduce((s, r) => s + Number(r.tokens_total || 0), 0);
  const groups = new Map<string, { client: string | null; tokens: number; sessions: Set<string>; messages: number }>();
  for (const r of rows) {
    const k = (key === 'model' ? r.model : r[key]) || (key === 'project' ? UNATTRIBUTED : '—');
    let g = groups.get(k);
    if (!g) {
      g = { client: null, tokens: 0, sessions: new Set(), messages: 0 };
      groups.set(k, g);
    }
    g.tokens += Number(r.tokens_total || 0);
    g.messages += Number(r.messages || 0);
    if (!g.client && r.client) g.client = r.client;
    // Session ids are only unique per host and bot.
    if (r.session_id) g.sessions.add(`${r.host}\u0000${r.bot}\u0000${r.session_id}`);
  }
  return [...groups.entries()]
    .map(([k, g]) => ({
      key: k,
      client: g.client,
      tokens: g.tokens,
      percent: total > 0 ? (g.tokens / total) * 100 : 0,
      sessions: g.sessions.size,
      messages: g.messages,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.key.localeCompare(b.key));
}

/** Per project for ONE plan's rows, with `unattributed` always present and last. */
export function projectShares(rows: Row[]): Share[] {
  const shares = shareBy(rows, 'project');
  const un = shares.find((s) => s.key === UNATTRIBUTED) ?? {
    key: UNATTRIBUTED,
    client: null,
    tokens: 0,
    percent: 0,
    sessions: 0,
    messages: 0,
  };
  return [...shares.filter((s) => s.key !== UNATTRIBUTED), un];
}
