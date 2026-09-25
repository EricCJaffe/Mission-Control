import { supabaseServer } from '@/lib/supabase/server'
import { back, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'
import { ensurePretripTask } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=itinerary`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const stop = stopFields(await req.formData())
  if (!stop.name) return back(req, withError(here, 'A stop needs a name.'))
  const { error } = await supabase.from('rv_trip_stops').insert({ ...stop, name: stop.name, trip_id: id, user_id: user.id })
  if (error) return back(req, withError(here, error.message))
  await ensurePretripTask(supabase, user.id, id)
  return back(req, here)
}
