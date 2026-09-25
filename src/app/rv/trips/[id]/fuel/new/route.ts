import { supabaseServer } from '@/lib/supabase/server'
import { back, date, num, text, withError } from '@/lib/maintenance/form'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=fuel`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const row = {
    user_id: user.id, trip_id: id, drive_date: date(form, 'drive_date'), leg: text(form, 'leg'), miles: num(form, 'miles'),
    route: text(form, 'route'), primary_stop: text(form, 'primary_stop'), backup: text(form, 'backup'), notes: text(form, 'notes'),
  }
  if (!row.drive_date && !row.leg) return back(req, withError(here, 'Give the driving day a date or a leg.'))
  const { error } = await supabase.from('rv_fuel_stops').insert(row)
  if (error) return back(req, withError(here, error.message))
  return back(req, here)
}
