import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { TRIP_STATUSES, type TripStatus } from '@/lib/rv/trips'
import { ensurePretripTask, syncDeadlineTasks } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const here = text(form, 'redirect') ?? `/rv/trips/${id}`
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (form.has('name')) {
    const name = text(form, 'name')
    if (!name) return back(req, withError(here, 'The name cannot be empty.'))
    patch.name = name
  }
  if (form.has('notes')) patch.notes = text(form, 'notes')
  if (form.has('summary')) patch.summary = text(form, 'summary')
  if (form.has('status')) {
    const s = text(form, 'status') ?? ''
    if (TRIP_STATUSES.includes(s as TripStatus)) patch.status = s
  }
  const { error } = await supabase.from('rv_trips').update(patch).eq('id', id)
  if (error) return back(req, withError(here, error.message))
  // Canceling a trip takes its deadline tasks with it; reopening restores them.
  if ('status' in patch) {
    await syncDeadlineTasks(supabase, user.id, id)
    await ensurePretripTask(supabase, user.id, id)
  }
  return back(req, here)
}
