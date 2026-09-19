import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/*
 * Park, kill, reopen.
 *
 * `promoted` is deliberately NOT settable here — that status is a claim that a
 * project exists, and only `mission.promote_idea` can honestly make it.
 */
const ALLOWED = new Set(['open', 'parked', 'killed'])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', req.url))

  const form = await req.formData()
  const status = String(form.get('status') || '').trim()
  if (!ALLOWED.has(status)) return NextResponse.redirect(new URL('/ideas', req.url))

  /*
   * Parking or killing does NOT count as touching it. Deciding to stop
   * thinking about something is not the same as thinking about it, and a park
   * that reset the clock would let an idea be quietly laundered into freshness
   * on its way out of the list.
   */
  await supabase.from('ideas').update({ status, updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.redirect(new URL('/ideas', req.url))
}
