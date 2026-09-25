import { supabaseServer } from '@/lib/supabase/server'
import { back, date, text, withError } from '@/lib/maintenance/form'
import { addTripTask } from '@/lib/rv/tasks'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=todos`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const title = text(form, 'title')
  if (!title) return back(req, withError(here, 'Say what needs doing.'))
  try {
    await addTripTask(supabase, user.id, id, { title, due: date(form, 'due') })
  } catch (e) {
    return back(req, withError(here, (e as Error).message))
  }
  return back(req, here)
}
