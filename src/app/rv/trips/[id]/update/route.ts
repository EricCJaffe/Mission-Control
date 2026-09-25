import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'

const STATUSES = new Set(['planned', 'active', 'done', 'canceled'])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')

  const form = await req.formData()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (form.has('name')) {
    const name = text(form, 'name')
    if (!name) return back(req, withError(here, 'The name cannot be empty.'))
    patch.name = name
  }
  if (form.has('notes')) patch.notes = text(form, 'notes')
  if (form.has('status')) {
    const s = text(form, 'status') ?? ''
    if (STATUSES.has(s)) patch.status = s
  }
  const { error } = await supabase.from('rv_trips').update(patch).eq('id', id)
  if (error) return back(req, withError(here, error.message))
  return back(req, here)
}
