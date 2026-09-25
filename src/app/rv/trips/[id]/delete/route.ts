import { supabaseServer } from '@/lib/supabase/server'
import { back, withError } from '@/lib/maintenance/form'

/* Deleting removes the record; Canceled keeps it. The confirm word is what
   tells the two apart when a thumb slips. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')

  const form = await req.formData()
  if (form.get('confirm') !== 'delete') return back(req, withError(`/rv/trips/${id}`, 'Type "delete" to confirm.'))
  const { error } = await supabase.from('rv_trips').delete().eq('id', id)
  if (error) return back(req, withError(`/rv/trips/${id}`, error.message))
  return back(req, '/rv')
}
