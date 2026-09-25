import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { stopFields } from '@/lib/rv/form'
import { ensurePretripTask } from '@/lib/rv/tasks'

/* A trip and, optionally, its first stop in one form. */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const name = text(form, 'trip_name')
  if (!name) return back(req, withError('/rv', 'Give the trip a name.'))

  const { data: trip, error } = await supabase
    .from('rv_trips')
    .insert({ user_id: user.id, name, summary: text(form, 'summary') })
    .select('id')
    .single()
  if (error || !trip) return back(req, withError('/rv', error?.message ?? 'Could not add the trip'))

  const stop = stopFields(form)
  if (stop.name) {
    const { error: stopError } = await supabase.from('rv_trip_stops').insert({ ...stop, name: stop.name, trip_id: trip.id, user_id: user.id })
    if (stopError) return back(req, withError(`/rv/trips/${trip.id}`, stopError.message))
    await ensurePretripTask(supabase, user.id, trip.id)
  }
  return back(req, `/rv/trips/${trip.id}`)
}
