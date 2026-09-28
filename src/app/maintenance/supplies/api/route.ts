import { NextResponse } from 'next/server';
import { owner } from '@/lib/helpers/owner';
import { today } from '@/lib/day';
import { STARTER_SUPPLIES, isSupplyCategory } from '@/lib/supplies';

/*
 * Every supplies change, one JSON route. RLS scopes every row to Eric; the
 * user_id filters are belt and braces, not the boundary.
 *
 *   create   a new item on the shelf
 *   update   edit its fields
 *   adjust   on_hand += delta (the − / + buttons), floored at zero
 *   need     flag or unflag it for the list
 *   bought   on_hand += qty, flag cleared, last_bought_on today
 *   archive  off the shelf and off the list; history kept
 *   attach   a job needs N of it (a supply id, or a new name to create)
 *   detach   remove that link
 *   starter  load the starter shelf, skipping any name already there
 */

type Body = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* The editable fields, from whatever subset the body carries. */
function fields(b: Body): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};
  if ('name' in b) {
    const name = str(b.name);
    if (!name) return { patch, error: 'Give it a name.' };
    patch.name = name;
  }
  if ('category' in b) {
    if (!isSupplyCategory(b.category)) return { patch, error: 'Unknown category.' };
    patch.category = b.category;
  }
  for (const k of ['store', 'unit', 'part_number', 'notes', 'need_note'] as const) if (k in b) patch[k] = str(b[k]);
  if ('asset_id' in b) patch.asset_id = str(b.asset_id);
  if ('on_hand' in b) {
    const n = num(b.on_hand) ?? 0;
    if (n < 0) return { patch, error: 'On hand cannot be negative.' };
    patch.on_hand = n;
  }
  if ('keep_min' in b) {
    const n = num(b.keep_min);
    if (n !== null && n < 0) return { patch, error: '"Keep at least" cannot be negative.' };
    patch.keep_min = n;
  }
  if ('need' in b) patch.need = Boolean(b.need);
  return { patch };
}

/* A duplicate name is the one error worth rewording: it is the one people hit. */
function dbError(message: string) {
  const msg = /supplies_owner_name_idx/.test(message) ? 'There is already an item with that name.' : message;
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const { db, userId } = o;
  const b = (await req.json().catch(() => ({}))) as Body;
  const id = str(b.id);
  const now = new Date().toISOString();

  switch (b.action) {
    case 'create': {
      const { patch, error } = fields({ category: 'other', ...b });
      if (error) return NextResponse.json({ error }, { status: 400 });
      if (!patch.name) return NextResponse.json({ error: 'Give it a name.' }, { status: 400 });
      const { data, error: e } = await db.from('supplies').insert({ ...patch, user_id: userId }).select('id').single();
      if (e) return dbError(e.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    case 'update': {
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const { patch, error } = fields(b);
      if (error) return NextResponse.json({ error }, { status: 400 });
      const { error: e } = await db.from('supplies').update({ ...patch, updated_at: now }).eq('id', id).eq('user_id', userId);
      return e ? dbError(e.message) : NextResponse.json({ ok: true });
    }
    case 'adjust':
    case 'bought': {
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const delta = num(b.action === 'bought' ? b.qty : b.delta);
      if (delta === null) return NextResponse.json({ error: 'How many?' }, { status: 400 });
      const { data: cur } = await db.from('supplies').select('on_hand').eq('id', id).eq('user_id', userId).maybeSingle();
      if (!cur) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
      const patch: Record<string, unknown> = { on_hand: Math.max(Number(cur.on_hand) + delta, 0), updated_at: now };
      if (b.action === 'bought') Object.assign(patch, { need: false, need_note: null, last_bought_on: today() });
      const { error: e } = await db.from('supplies').update(patch).eq('id', id).eq('user_id', userId);
      return e ? dbError(e.message) : NextResponse.json({ ok: true });
    }
    case 'need': {
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const need = Boolean(b.need);
      const { error: e } = await db
        .from('supplies')
        .update({ need, need_note: need ? str(b.note) : null, updated_at: now })
        .eq('id', id)
        .eq('user_id', userId);
      return e ? dbError(e.message) : NextResponse.json({ ok: true });
    }
    case 'archive': {
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const { error: e } = await db.from('supplies').update({ active: false, need: false, updated_at: now }).eq('id', id).eq('user_id', userId);
      return e ? dbError(e.message) : NextResponse.json({ ok: true });
    }
    case 'attach': {
      const taskId = str(b.task_id);
      const qty = num(b.qty) ?? 1;
      if (!taskId) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
      if (qty <= 0) return NextResponse.json({ error: 'How many does the job need?' }, { status: 400 });
      const { data: task } = await db.from('tasks').select('id').eq('id', taskId).eq('user_id', userId).maybeSingle();
      if (!task) return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
      let supplyId = str(b.supply_id);
      if (!supplyId) {
        // Typed a name that is not on the shelf yet: reuse a match, or add it at zero,
        // which puts it straight on the list.
        const name = str(b.new_name);
        if (!name) return NextResponse.json({ error: 'Pick an item or type a new one.' }, { status: 400 });
        const { data: existing } = await db.from('supplies').select('id').eq('user_id', userId).eq('active', true).ilike('name', name.replace(/[\\%_]/g, '\\$&')).maybeSingle();
        if (existing) supplyId = existing.id as string;
        else {
          const { data: made, error: e } = await db
            .from('supplies')
            .insert({ user_id: userId, name, category: isSupplyCategory(b.category) ? b.category : 'other', store: str(b.store) })
            .select('id')
            .single();
          if (e) return dbError(e.message);
          supplyId = made.id as string;
        }
      }
      const { error: e } = await db
        .from('supply_needs')
        .upsert({ user_id: userId, task_id: taskId, supply_id: supplyId, qty }, { onConflict: 'task_id,supply_id' });
      return e ? dbError(e.message) : NextResponse.json({ ok: true, supply_id: supplyId });
    }
    case 'detach': {
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
      const { error: e } = await db.from('supply_needs').delete().eq('id', id).eq('user_id', userId);
      return e ? dbError(e.message) : NextResponse.json({ ok: true });
    }
    case 'starter': {
      const { data: have } = await db.from('supplies').select('name').eq('user_id', userId).eq('active', true);
      const taken = new Set((have ?? []).map((r) => String(r.name).toLowerCase()));
      const rows = STARTER_SUPPLIES.filter((s) => !taken.has(s.name.toLowerCase())).map((s) => ({ ...s, user_id: userId }));
      if (!rows.length) return NextResponse.json({ ok: true, added: 0 });
      const { error: e } = await db.from('supplies').insert(rows);
      return e ? dbError(e.message) : NextResponse.json({ ok: true, added: rows.length });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
