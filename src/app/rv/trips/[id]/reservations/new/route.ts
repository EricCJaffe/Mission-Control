import { supabaseServer } from '@/lib/supabase/server'
import { back, withError } from '@/lib/maintenance/form'
import { reservationFields } from '@/lib/rv/form'
import { syncDeadlineTasks } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=reservations`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const r = reservationFields(await req.formData())
  if (!r.vendor && !r.stop_id) return back(req, withError(here, 'Name the vendor or pick the stop.'))
  const { error } = await supabase.from('rv_reservations').insert({ ...r, trip_id: id, user_id: user.id })
  if (error) return back(req, withError(here, error.message))
  await syncDeadlineTasks(supabase, user.id, id)
  return back(req, here)
}
