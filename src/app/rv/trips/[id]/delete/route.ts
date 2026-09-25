import { supabaseServer } from '@/lib/supabase/server'
import { back, withError } from '@/lib/maintenance/form'

/*
 * Deleting removes the record; Canceled keeps it. The confirm word is what
 * tells the two apart when a thumb slips. The trip's tasks go first: the link
 * rows cascade from the trip, but the tasks themselves would otherwise stay
 * open in the brief for a trip that no longer exists.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')

  const form = await req.formData()
  if (form.get('confirm') !== 'delete') return back(req, withError(`/rv/trips/${id}?tab=trip`, 'Type "delete" to confirm.'))
  const { data: links } = await supabase.from('rv_trip_tasks').select('task_id').eq('trip_id', id)
  const taskIds = (links ?? []).map((l) => l.task_id as string)
  if (taskIds.length) await supabase.from('tasks').delete().in('id', taskIds)
  const { error } = await supabase.from('rv_trips').delete().eq('id', id)
  if (error) return back(req, withError(`/rv/trips/${id}?tab=trip`, error.message))
  return back(req, '/rv')
}
