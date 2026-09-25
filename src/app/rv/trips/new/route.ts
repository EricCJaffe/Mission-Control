import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'

/* A trip and its first stop in one form, because a trip with no campground
   has no dates and cannot show on the calendar. */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const name = text(form, 'name')
  const stop = stopFields(form)
  if (!name) return back(req, withError('/rv', 'Give the trip a name.'))

  const { data: trip, error } = await supabase
    .from('rv_trips')
    .insert({ user_id: user.id, name, notes: text(form, 'notes_trip') })
    .select('id')
    .single()
  if (error || !trip) return back(req, withError('/rv', error?.message ?? 'Could not add the trip'))

  if (stop.campground && stop.arrive_on) {
    const { error: stopError } = await supabase.from('rv_trip_stops').insert({ ...stop, trip_id: trip.id, user_id: user.id })
    if (stopError) return back(req, withError(`/rv/trips/${trip.id}`, stopError.message))
  }
  return back(req, `/rv/trips/${trip.id}`)
}
