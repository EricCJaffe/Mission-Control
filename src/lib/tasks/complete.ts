import { nextOccurrence } from './recurrence.ts';

/**
 * What "done" means for a task, in one place.
 *
 * A recurring task IS the series: completing it moves the due date to the next
 * occurrence and leaves it open, rather than spawning a row per occurrence. A
 * non-recurring task, or a series whose COUNT or UNTIL has run out, closes.
 *
 * Lifted out of /tasks/update when the maintenance module needed the same rule.
 * Two copies of this arithmetic would drift, and the first sign would be a
 * furnace filter that rolls forward from one screen and closes from the other.
 */
export type CompletableTask = {
  recurrence_rule: string | null;
  recurrence_anchor: string | null;
  due_date: string | null;
  recurrence_count: number | null;
};

export function completionPatch(
  current: CompletableTask | null,
  todayIso: string,
  nowIso: string = new Date().toISOString(),
): Record<string, unknown> {
  const rule = current?.recurrence_rule ?? null;
  if (!rule) return { status: 'done', last_completed_at: nowIso };

  const anchor = current?.recurrence_anchor ?? current?.due_date ?? todayIso;
  /*
   * Roll from whichever is later, the due date or today. A filter changed three
   * weeks late should next be due one interval from when it was actually
   * changed, not from the date it was missed — otherwise one late completion
   * leaves the next occurrence already overdue.
   */
  const due = current?.due_date ?? todayIso;
  const from = due > todayIso ? due : todayIso;
  const soFar = Number(current?.recurrence_count ?? 0);
  const next = nextOccurrence(rule, anchor, from, soFar);

  // No next occurrence means the series is finished; it closes as done.
  if (!next) return { status: 'done', last_completed_at: nowIso };

  return {
    status: 'todo',
    due_date: next,
    recurrence_count: soFar + 1,
    last_completed_at: nowIso,
  };
}
