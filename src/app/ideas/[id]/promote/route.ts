import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Idea -> project, with its first tasks.
 *
 * The work is done by `mission.promote_idea`, not here, so the project, its
 * tasks and the idea's new status all land in one transaction. A route doing
 * three sequential writes can leave a project behind with the idea still open,
 * and the next weekly brief then nags about something already started.
 */
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

  const { data: projectId, error } = await supabase.rpc('promote_idea', {
    p_idea_id: id,
    p_task_titles: taskTitles,
  })

  if (error || !projectId) return NextResponse.redirect(new URL('/ideas', req.url))

  // Land on the work, not back on the board. The reason to promote an idea is
  // to start it.
  return NextResponse.redirect(new URL(`/tasks?project=${projectId}`, req.url))
}
