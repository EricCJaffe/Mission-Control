import { supabaseServer } from '@/lib/supabase/server'
import { back, text } from '@/lib/maintenance/form'
import { syncDeadlineTasks } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  const { rid } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const { data: row } = await supabase.from('rv_reservations').select('trip_id').eq('id', rid).maybeSingle()
  // The deadline task goes with it: its source_ref names this reservation.
  await supabase.from('tasks').delete().eq('source_ref', `rv-cancel:${rid}`)
  await supabase.from('rv_reservations').delete().eq('id', rid)
  if (row?.trip_id) await syncDeadlineTasks(supabase, user.id, row.trip_id as string)
  return back(req, text(form, 'redirect') ?? '/rv')
}
