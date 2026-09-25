import { supabaseServer } from '@/lib/supabase/server'
import { back, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const stop = stopFields(await req.formData())
  if (!stop.campground || !stop.arrive_on) return back(req, withError(here, 'A campground and an arrival date are required.'))
  const { error } = await supabase.from('rv_trip_stops').insert({ ...stop, trip_id: id, user_id: user.id })
  if (error) return back(req, withError(here, error.message))
  return back(req, here)
}
