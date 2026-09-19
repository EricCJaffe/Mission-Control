import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * "Still alive" — the whole point of the board's clock.
 *
 * This is the only route besides create, edit and promote that may write
 * `touched_at`, because only a person pressing a button counts as attention.
 * Anything automated that starts bumping this makes "idle 40 days" a lie.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: current } = await supabase
    .from('ideas')
    .select('touch_count')
    .eq('id', id)
    .maybeSingle()

  await supabase
    .from('ideas')
    .update({
      touched_at: new Date().toISOString(),
      touch_count: (current?.touch_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.redirect(new URL('/ideas', req.url))
}
