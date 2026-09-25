import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'
import { reservationFields } from '@/lib/rv/form'
import { syncDeadlineTasks } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ rid: string }> }) {
  const { rid } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const returnTo = text(form, 'redirect') ?? '/rv'
  const { data, error } = await supabase.from('rv_reservations').update(reservationFields(form)).eq('id', rid).select('trip_id').single()
  if (error) return back(req, withError(returnTo, error.message))
  await syncDeadlineTasks(supabase, user.id, data.trip_id as string)
  return back(req, returnTo)
}
