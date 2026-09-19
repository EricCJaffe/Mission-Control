/**
 * The idea board's one piece of arithmetic, in one place.
 *
 * `idleDays` is the number the whole feature exists to show, and it is read
 * off `touched_at` — never `updated_at`. See the migration header
 * (`20260919145301_ideas_board.sql`): `updated_at` moves whenever any process
 * writes the row, so a backfill would silently reset every idle count to zero
 * and the board would report perfect attention the day after a migration.
 */

export type IdeaRow = {
  id: string
  title: string
  body: string | null
  domain: string | null
  status: string
  captured_at: string
  touched_at: string
  touch_count: number
  promoted_project_id: string | null
  promoted_at: string | null
  source: string
  source_url: string | null
}

/** Whole days since the idea was last deliberately touched. */
export function idleDays(touchedAt: string | null, now: number = Date.now()): number | null {
  if (!touchedAt) return null
  const then = new Date(touchedAt).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((now - then) / 86_400_000))
}

/**
 * How loudly an idle idea is shown.
 *
 * Deliberately gentle up to a month: an idea is ALLOWED to sit, and a board
 * that turns red in a week teaches you to stop capturing. Red only arrives at
 * the point where the honest reading is "this is not an idea any more, it is
 * a decision you are avoiding".
 */
export type IdleTone = 'fresh' | 'aging' | 'stale'

export const IDEA_AGING_AFTER_DAYS = 30
export const IDEA_STALE_AFTER_DAYS = 90

export function idleTone(days: number | null): IdleTone {
  if (days === null) return 'fresh'
  if (days >= IDEA_STALE_AFTER_DAYS) return 'stale'
  if (days >= IDEA_AGING_AFTER_DAYS) return 'aging'
  return 'fresh'
}

/** "today", "3 days", "6 weeks" — short enough for a card and for an email. */
export function idleLabel(days: number | null): string {
  if (days === null) return 'never touched'
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  if (days < 21) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}
