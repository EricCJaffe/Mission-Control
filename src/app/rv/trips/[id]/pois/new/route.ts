import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=see`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const name = text(form, 'name')
  const stopId = text(form, 'stop_id')
  if (!name || !stopId) return back(req, withError(here, 'Pick a stop and name the place.'))
  const { error } = await supabase.from('rv_pois').insert({
    user_id: user.id, stop_id: stopId, name, description: text(form, 'description'), garden: form.get('garden') === 'on',
  })
  if (error) return back(req, withError(here, error.message))
  return back(req, here)
}
