import { supabaseServer } from '@/lib/supabase/server'
import { back, text } from '@/lib/maintenance/form'

/* "We'll do this one" — the chosen flag is the itinerary's short list. */
export async function POST(req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')
  const form = await req.formData()
  const { data } = await supabase.from('rv_pois').select('chosen').eq('id', pid).maybeSingle()
  if (data) await supabase.from('rv_pois').update({ chosen: !data.chosen }).eq('id', pid)
  return back(req, text(form, 'redirect') ?? '/rv')
}
