import { supabaseServer } from '@/lib/supabase/server'
import { back, text } from '@/lib/maintenance/form'
import { ensurePretripTask } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const { data } = await supabase.from('rv_trip_stops').delete().eq('id', stopId).select('trip_id').maybeSingle()
  if (data?.trip_id) await ensurePretripTask(supabase, user.id, data.trip_id as string)
  return back(req, text(form, 'redirect') ?? '/rv')
}
