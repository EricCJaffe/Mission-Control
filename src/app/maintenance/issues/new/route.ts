import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'

/* A fault or loose end that is not a schedule: a code, a warning light, a part to buy. */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const form = await req.formData()
  const returnTo = text(form, 'redirect') ?? '/maintenance'
  const title = text(form, 'title')
  if (!title) return back(req, withError(returnTo, 'Say what is wrong.'))
  const { error } = await supabase.from('maintenance_issues').insert({
    user_id: user.id,
    asset_id: text(form, 'asset_id'),
    title,
    system: text(form, 'system'),
    details: text(form, 'details'),
    next_step: text(form, 'next_step'),
  })
  if (error) return back(req, withError(returnTo, error.message))
  return back(req, returnTo)
}
