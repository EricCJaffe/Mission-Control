/**
 * The arrival and departure checklists, as data.
 *
 * The content lives in checklists.json, exactly as Eric supplied it
 * (docs/rv-checklists.md is the human-readable twin). The spec is explicit:
 * "content is data, not hard-coded UI". Editing a step is a JSON edit; the
 * screens never change.
 *
 * Tick state is NOT here. It is in mission.rv_checklist_checks, keyed by run —
 * see the migration 20260925142330_rv_module.sql for why.
 */

import data from './checklists.json' with { type: 'json' };

export type ChecklistItem = { id: string; text: string; note: string | null };
/* `guide` names an entry in guides-content.ts, shown as a link on the section. */
export type ChecklistSection = { id: string; title: string; warning: string | null; guide?: string; items: ChecklistItem[] };
export type Checklist = { id: string; title: string; sections: ChecklistSection[] };

export type Rig = {
  coach: string;
  toad: string;
  towbar: string;
  toad_brakes: string;
  tire_psi: { coach_front: number; coach_rear: number; jeep: number };
};

export const RIG = data.rig as Rig;
export const CHECKLISTS = data.checklists as Checklist[];

export function getChecklist(id: string): Checklist | null {
  return CHECKLISTS.find((c) => c.id === id) ?? null;
}

export function itemIds(checklist: Checklist): string[] {
  return checklist.sections.flatMap((s) => s.items.map((i) => i.id));
}

/**
 * Progress for a run. Only ids that exist in the current JSON count, so a
 * step removed from the file cannot leave a run stuck at 41 of 40.
 */
export function progress(checklist: Checklist, checked: Iterable<string>) {
  const all = itemIds(checklist);
  const valid = new Set(all);
  const done = new Set([...checked].filter((id) => valid.has(id)));
  const skipped = all.filter((id) => !done.has(id));
  return {
    total: all.length,
    done: done.size,
    complete: all.length > 0 && done.size === all.length,
    skipped,
    percent: all.length ? Math.round((done.size / all.length) * 100) : 0,
  };
}

/** Minutes from start to the last tick, for "average departure time". */
export function durationMinutes(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
}
