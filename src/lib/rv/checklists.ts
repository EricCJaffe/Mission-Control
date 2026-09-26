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
import ops from '../checklists/ops.json' with { type: 'json' };

export type ChecklistItem = { id: string; text: string; note: string | null };
/* `guide` names an entry in guides-content.ts, shown as a link on the section. */
/* `critical` shows the warning red rather than yellow: the step it guards is
   the one where skipping loses something. */
export type ChecklistSection = { id: string; title: string; warning: string | null; guide?: string; critical?: boolean; items: ChecklistItem[] };
/* `ordered`: an item cannot be ticked until every item above it is. For a
   procedure whose danger is doing step 3 before step 2, not for a packing list.
   `duration` is the expected time, shown before the first run has history. */
export type Checklist = { id: string; title: string; duration?: string; ordered?: boolean; sections: ChecklistSection[] };

export type Rig = {
  coach: string;
  toad: string;
  towbar: string;
  toad_brakes: string;
  tire_psi: { coach_front: number; coach_rear: number; jeep: number };
};

export const RIG = data.rig as Rig;
export const CHECKLISTS = data.checklists as Checklist[];

/*
 * Checklists that are not about the RV — the two-account procedure first —
 * served at /checklists on the same runs and ticks. Kept out of CHECKLISTS so
 * the RV page lists only travel-day ones.
 */
export const OPS_CHECKLISTS = ops.checklists as Checklist[];

/* The checklists a run can attach to the stop the rig is at today. */
export const STOP_CHECKLISTS = new Set(['arrival', 'departure']);

export function getChecklist(id: string): Checklist | null {
  return CHECKLISTS.find((c) => c.id === id) ?? OPS_CHECKLISTS.find((c) => c.id === id) ?? null;
}

export function itemIds(checklist: Checklist): string[] {
  return checklist.sections.flatMap((s) => s.items.map((i) => i.id));
}

/**
 * The item that must be ticked before `itemId` can be, on an ordered
 * checklist; null when it may be ticked now. Only the FIRST unticked item is
 * open, so "log in, then prepare" cannot become "log in, then something else".
 */
export function blockedBy(checklist: Checklist, checked: Iterable<string>, itemId: string): string | null {
  if (!checklist.ordered) return null;
  const done = new Set(checked);
  for (const id of itemIds(checklist)) {
    if (id === itemId) return null;
    if (!done.has(id)) return id;
  }
  return null;
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
