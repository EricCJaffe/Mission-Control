import { supabaseServer } from '@/lib/supabase/server'
import { back, num, text, withError } from '@/lib/maintenance/form'
import type { Hazard, TripData } from '@/lib/rv/trips'

/*
 * Hazards live in the trip's `data` bag: a short list read whole, never
 * queried into. `remove=<index>` deletes one; otherwise the form adds one.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=hazards`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')

  const form = await req.formData()
  const { data: trip } = await supabase.from('rv_trips').select('data').eq('id', id).maybeSingle()
  if (!trip) return back(req, '/rv')
  const data = (trip.data ?? {}) as TripData
  const hazards: Hazard[] = [...(data.hazards ?? [])]
  const remove = num(form, 'remove')
  if (remove !== null) {
    hazards.splice(remove, 1)
  } else {
    const where = text(form, 'where')
    const rule = text(form, 'rule')
    if (!where || !rule) return back(req, withError(here, 'Say where, and what the rule is.'))
    hazards.push({ where, rule })
  }
  const { error } = await supabase.from('rv_trips').update({ data: { ...data, hazards }, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return back(req, withError(here, error.message))
  return back(req, here)
}
