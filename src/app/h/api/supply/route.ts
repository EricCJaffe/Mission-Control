import { NextResponse } from 'next/server';
import { currentHelper, serviceClient } from '@/lib/helpers/server';

/*
 * "We're out of…" from a helper's phone. The person who used the last of it
 * is the one who knows, so they can put it on Eric's shopping list; they
 * cannot change counts or see the list. Service role, filtered to their owner.
 */
export async function POST(req: Request) {
  const h = await currentHelper();
  if (!h) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { supply_id?: string; name?: string; note?: string };
  const db = serviceClient();
  const note = [h.worker.name, b.note?.trim()].filter(Boolean).join(': ').slice(0, 200);
  const now = new Date().toISOString();

  if (b.supply_id) {
    const { data, error } = await db
      .from('supplies')
      .update({ need: true, need_note: note, updated_at: now })
      .eq('id', b.supply_id)
      .eq('user_id', h.owner_id)
      .eq('active', true)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const name = b.name?.trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'Say what you need.' }, { status: 400 });
  const { data: existing } = await db
    .from('supplies')
    .select('id')
    .eq('user_id', h.owner_id)
    .eq('active', true)
    .ilike('name', name.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle();
  const { error } = existing
    ? await db.from('supplies').update({ need: true, need_note: note, updated_at: now }).eq('id', existing.id)
    : await db.from('supplies').insert({ user_id: h.owner_id, name, category: 'other', need: true, need_note: note });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
