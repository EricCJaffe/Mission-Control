import { supabaseServer } from '@/lib/supabase/server'
import { back, text } from '@/lib/maintenance/form'

export async function POST(req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')
  const form = await req.formData()
  await supabase.from('rv_pois').delete().eq('id', pid)
  return back(req, text(form, 'redirect') ?? '/rv')
}
