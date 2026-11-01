/**
 * Parsing for the one-time running plan seed (scripts/fitness/seed-running-plan.mjs).
 *
 * The seed content is personal and never lives in this repo: it is read at
 * apply time from untracked files on the box. This module only knows the
 * shape of those files, and is tested with synthetic text.
 *
 *  - the "source of truth" note: a `## (b)` section holding a markdown session
 *    table (one row, a free-text line after it is the notes) and a `## (c)`
 *    section holding numbered coaching recommendations;
 *  - an access reference: markdown, first `# ` heading is the title.
 */

import { parseDuration } from './activity-files.ts';

export interface SeedSession {
  session_date: string;
  distance_mi: number;
  duration_s: number | null;
  pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  z1_pct: number | null;
  z2_pct: number | null;
  z3_pct: number | null;
  z4_pct: number | null;
  longest_continuous_min: number | null;
  gain_ft: number | null;
  kcal: number | null;
  feel: number | null;
  points: number | null;
  notes: string | null;
}

/** The body of the `## (<letter>)` section, up to the next `## ` or `# ` heading. */
export function section(md: string, letter: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s*\\(${letter}\\)`, 'i').test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

const firstNumber = (v: string | undefined): number | null => {
  const m = /-?\d+(?:\.\d+)?/.exec((v ?? '').replace(/,/g, ''));
  return m ? Number(m[0]) : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const n = firstNumber(v);
  return n === null ? null : Math.round(n);
};

/** Every session row of the `(b)` table, keyed by its header names. */
export function parseSessions(md: string): SeedSession[] {
  const body = section(md, 'b');
  const lines = body.split('\n');
  const tableLines = lines.filter((l) => l.trim().startsWith('|'));
  if (tableLines.length < 3) return [];
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const header = cells(tableLines[0]).map((h) => h.toLowerCase());
  const col = (row: string[], ...names: string[]) => {
    const i = header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    return i >= 0 ? row[i] : undefined;
  };
  const after = lines.filter((l) => l.trim() && !l.trim().startsWith('|')).join(' ').trim() || null;

  return tableLines.slice(2).map((line) => {
    const row = cells(line);
    const pace = /(\d{1,2}:\d{2})/.exec(col(row, 'pace') ?? '')?.[1] ?? null;
    const duration = parseDuration(col(row, 'time') ?? '');
    return {
      session_date: (col(row, 'date') ?? '').slice(0, 10),
      distance_mi: firstNumber(col(row, 'dist')) ?? 0,
      duration_s: duration || null,
      pace,
      avg_hr: intOrNull(col(row, 'avg hr')),
      max_hr: intOrNull(col(row, 'max hr')),
      z1_pct: intOrNull(col(row, 'z1')),
      z2_pct: intOrNull(col(row, 'z2')),
      z3_pct: intOrNull(col(row, 'z3')),
      z4_pct: intOrNull(col(row, 'z4')),
      longest_continuous_min: firstNumber(col(row, 'longest')),
      gain_ft: intOrNull(col(row, 'gain')),
      kcal: intOrNull(col(row, 'kcal')),
      feel: intOrNull(col(row, 'feel')),
      points: intOrNull(col(row, 'points')),
      notes: after,
    };
  }).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.session_date) && s.distance_mi > 0);
}

/** The numbered list in section `(c)`, in order. */
export function parseRecommendations(md: string): Array<{ ordinal: number; text: string }> {
  return section(md, 'c')
    .split('\n')
    .map((l) => /^\s*(\d+)\.\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ ordinal: Number(m[1]), text: m[2].trim() }));
}

/** Title (first `# ` heading) and the whole text as the body. */
export function parseDoc(md: string): { title: string; body: string } {
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? 'Reference';
  return { title, body: md.trim() };
}
