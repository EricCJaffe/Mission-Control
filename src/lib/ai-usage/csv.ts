/*
 * The monthly per-client CSV, for billing conversations: one row per
 * (plan, project), percent of that plan's month, plus each plan's
 * `unattributed` row. No dollar columns (see shares.ts for why).
 */

import { projectShares, inDays } from './shares.ts';
import type { AiUsageSnapshot } from './types.ts';

export const CSV_COLUMNS = ['month', 'plan', 'project', 'client', 'tokens_total', 'percent_of_plan', 'sessions'] as const;

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** First and last ET day of a YYYY-MM. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** RFC 4180 quoting, plus a leading quote on anything a spreadsheet would run as a formula. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Row = Pick<
  AiUsageSnapshot,
  'plan_slug' | 'day' | 'host' | 'bot' | 'session_id' | 'project' | 'client' | 'model' | 'tokens_total' | 'messages'
>;

export function buildUsageCsv(month: string, planSlugs: string[], rows: Row[]): string {
  const { from, to } = monthRange(month);
  const monthRows = inDays(rows, from, to);
  const slugs = [...new Set([...planSlugs, ...monthRows.map((r) => r.plan_slug)])];
  const lines = [CSV_COLUMNS.join(',')];
  for (const slug of slugs) {
    for (const s of projectShares(monthRows.filter((r) => r.plan_slug === slug))) {
      lines.push(
        [month, slug, s.key, s.client, s.tokens, s.percent.toFixed(2), s.sessions].map(csvCell).join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}
