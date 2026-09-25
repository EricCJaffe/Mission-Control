import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/* A short-lived signed link, issued at the moment of opening, never stored. */
export async function GET(req: Request, ctx: { params: Promise<{ did: string }> }) {
  const { did } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', req.url))
  const { data: doc } = await supabase.from('rv_documents').select('bucket,path,url').eq('id', did).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.url) return NextResponse.redirect(doc.url as string)
  if (!doc.path) return NextResponse.json({ error: 'Not uploaded yet' }, { status: 404 })
  const { data, error } = await supabase.storage.from(doc.bucket as string).createSignedUrl(doc.path as string, 60 * 10)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not sign' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl)
}
