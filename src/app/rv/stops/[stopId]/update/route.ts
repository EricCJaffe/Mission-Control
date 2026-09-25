import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'
import { ensurePretripTask } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const returnTo = text(form, 'redirect') ?? '/rv'
  const stop = stopFields(form)
  if (!stop.name) return back(req, withError(returnTo, 'A stop needs a name.'))
  const { data, error } = await supabase.from('rv_trip_stops').update({ ...stop, name: stop.name }).eq('id', stopId).select('trip_id').single()
  if (error) return back(req, withError(returnTo, error.message))
  // Moving the first date moves the Pre-Trip reminder with it.
  if (data?.trip_id) await ensurePretripTask(supabase, user.id, data.trip_id as string)
  return back(req, returnTo)
}
