import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const form = await req.formData()
  const title = String(form.get('title') || '').trim()

  if (!title) return NextResponse.redirect(new URL('/projects', req.url))

  await supabase.from('projects').insert({
    user_id: user.id,
    title,
  })

  return NextResponse.redirect(new URL('/projects', req.url))
}
