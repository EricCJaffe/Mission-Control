/**
 * The coding-initiatives shortlist on /projects.
 *
 * Rows come from scripts/sync/initiatives.ts (kind = 'initiative'). Order is
 * the point of a shortlist: red first, then yellow, then green, then any with
 * no reading — and within a color the one furthest behind plan first.
 *
 * No reading is shown as "no rag", never painted green: in the framework a
 * number with no reading this month is red, and a missing value that looks
 * on track is the worst kind of wrong.
 */

export type Rag = 'red' | 'yellow' | 'green';

export type InitiativeRow = {
  id: string;
  title: string;
  rag: Rag | null;
  plan_pct: number | null;
  owner_session: string | null;
  plan_doc: string | null;
  blockers: string[] | null;
  last_activity_at: string | null;
  next_step: string | null;
  status: string;
};

const RANK: Record<string, number> = { red: 0, yellow: 1, green: 2 };

export function sortInitiatives<T extends Pick<InitiativeRow, 'rag' | 'plan_pct' | 'title'>>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (RANK[a.rag ?? ''] ?? 3) - (RANK[b.rag ?? ''] ?? 3) ||
      (a.plan_pct ?? -1) - (b.plan_pct ?? -1) ||
      a.title.localeCompare(b.title),
  );
}

export function ragBadge(rag: Rag | null): { label: string; className: string } {
  if (rag === 'red') return { label: 'red', className: 'bg-red-50 text-red-700 border-red-200' };
  if (rag === 'yellow') return { label: 'yellow', className: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
  if (rag === 'green') return { label: 'green', className: 'bg-green-50 text-green-700 border-green-200' };
  return { label: 'no rag', className: 'bg-slate-50 text-slate-500 border-slate-200' };
}
