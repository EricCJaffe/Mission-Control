import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

const DOMAINS = new Set(['spirit', 'body', 'soul', 'family', 'work'])

export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const form = await req.formData()
  const title = String(form.get('title') || '').trim()
  const body = String(form.get('body') || '').trim()
  const domainRaw = String(form.get('domain') || '').trim()
  const domain = DOMAINS.has(domainRaw) ? domainRaw : null

  if (!title) return NextResponse.redirect(new URL('/ideas', req.url))

  await supabase.from('ideas').insert({
    user_id: user.id,
    title,
    body: body || null,
    domain,
    source: 'manual',
  })

  return NextResponse.redirect(new URL('/ideas', req.url))
}
