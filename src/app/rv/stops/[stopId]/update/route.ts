import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'

export async function POST(req: Request, ctx: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')

  const form = await req.formData()
  const returnTo = text(form, 'redirect') ?? '/rv'
  const stop = stopFields(form)
  if (!stop.campground || !stop.arrive_on) return back(req, withError(returnTo, 'A campground and an arrival date are required.'))
  const { error } = await supabase.from('rv_trip_stops').update(stop).eq('id', stopId)
  if (error) return back(req, withError(returnTo, error.message))
  return back(req, returnTo)
}
