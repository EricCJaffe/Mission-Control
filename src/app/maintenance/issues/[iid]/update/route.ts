import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { back, text, withError } from '@/lib/maintenance/form'

const STATUSES = new Set(['open', 'scheduled', 'resolved'])

export async function POST(req: Request, ctx: { params: Promise<{ iid: string }> }) {
  const { iid } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')
  const form = await req.formData()
  const returnTo = text(form, 'redirect') ?? '/maintenance'
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (form.has('status')) {
    const s = text(form, 'status') ?? ''
    if (STATUSES.has(s)) {
      patch.status = s
      patch.resolved_on = s === 'resolved' ? today() : null
    }
  }
  if (form.has('next_step')) patch.next_step = text(form, 'next_step')
  if (form.has('details')) patch.details = text(form, 'details')
  const { error } = await supabase.from('maintenance_issues').update(patch).eq('id', iid)
  if (error) return back(req, withError(returnTo, error.message))
  return back(req, returnTo)
}
