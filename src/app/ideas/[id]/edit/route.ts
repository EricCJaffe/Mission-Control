import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

const DOMAINS = new Set(['spirit', 'body', 'soul', 'family', 'work'])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', req.url))

  const form = await req.formData()
  const title = String(form.get('title') || '').trim()
  const body = String(form.get('body') || '').trim()
  const domainRaw = String(form.get('domain') || '').trim()
  const domain = DOMAINS.has(domainRaw) ? domainRaw : null

  if (!title) return NextResponse.redirect(new URL('/ideas', req.url))

  // Editing IS attention, so the clock resets. Rewriting the thought is the
  // most engaged thing you can do with an idea short of starting it.
  const now = new Date().toISOString()
  await supabase
    .from('ideas')
    .update({ title, body: body || null, domain, touched_at: now, updated_at: now })
    .eq('id', id)

  return NextResponse.redirect(new URL('/ideas', req.url))
}
