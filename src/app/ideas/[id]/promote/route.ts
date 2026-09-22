import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Idea -> project, with its first tasks, here or in fsaos.
 *
 * MISSION CONTROL is done by `mission.promote_idea`, not here, so the project,
 * its tasks and the idea's new status all land in one transaction. A route
 * doing three sequential writes can leave a project behind with the idea still
 * open, and the next weekly brief then nags about something already started.
 *
 * FSAOS IS QUEUED, NOT WRITTEN. Eric, 2026-09-19: "Mission Control promote
 * should offer an opportunity to promote to FSAOS." fsaos is a different
 * Supabase project and this app runs on Vercel, so writing to it from here
 * would mean carrying an fsaos service-role key in this app's environment —
 * a key that bypasses RLS on the whole business, held by a personal app, to
 * duplicate logic the box already has in `mc-idea --promote --to fsaos`.
 * Instead the request is recorded and the box acts on it within a few minutes.
 * See the migration `20260919175001_ideas_promote_to_fsaos.sql`.
 */

/** The only queued target. Mission Control is synchronous and needs no queue. */
const QUEUED_TARGETS = new Set(['fsaos'])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', req.url))

  const form = await req.formData()
  const taskTitles = String(form.get('tasks') || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 50)
  const target = String(form.get('target') || 'mission')

  if (QUEUED_TARGETS.has(target)) {
    /*
     * Asking IS a deliberate human action, so it moves `touched_at` — the same
     * clock `promote_idea` moves, for the same reason. The drain deliberately
     * does NOT touch it again when it completes: that would count one decision
     * of Eric's twice, and the board's only number is a measure of his
     * attention, not of the queue's.
     */
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('ideas')
      .update({
        promote_request: target,
        promote_requested_at: now,
        promote_tasks: taskTitles,
        // A retry clears the last failure, so the card stops showing an error
        // that is no longer true.
        promote_error: null,
        touched_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'open')

    if (error) return NextResponse.redirect(new URL('/ideas?queue=failed', req.url))
    // Back to the board, which is where the queued state is shown. There is no
    // project to land on yet — that is the whole difference from the other path.
    return NextResponse.redirect(new URL('/ideas?queued=fsaos', req.url))
  }

  const { data: projectId, error } = await supabase.rpc('promote_idea', {
    p_idea_id: id,
    p_task_titles: taskTitles,
  })

  if (error || !projectId) return NextResponse.redirect(new URL('/ideas', req.url))

  // Land on the work, not back on the board. The reason to promote an idea is
  // to start it.
  return NextResponse.redirect(new URL(`/tasks?project=${projectId}`, req.url))
}
