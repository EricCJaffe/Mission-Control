import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Marks a request prayed or answered.
 *
 * "Answered" sets a status and a note rather than deleting the row. The record
 * is the point of the practice — an app that tidies away what has been
 * resolved destroys the evidence that makes it worth keeping.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : null;
  const action = body?.action;
  if (!id || (action !== 'prayed' && action !== 'answered')) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 });
  }

  if (action === 'prayed') {
    // Read-modify-write on the counter: the row count is small and per-user,
    // and an RPC for an increment nobody races is not worth the indirection.
    const { data: current } = await supabase
      .from('prayer_requests')
      .select('prayed_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = await supabase
      .from('prayer_requests')
      .update({
        last_prayed_at: new Date().toISOString(),
        prayed_count: (current?.prayed_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const note = typeof body?.answer_note === 'string' ? body.answer_note.trim() || null : null;
  const { error } = await supabase
    .from('prayer_requests')
    .update({
      status: 'answered',
      answered_at: new Date().toISOString(),
      answer_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
