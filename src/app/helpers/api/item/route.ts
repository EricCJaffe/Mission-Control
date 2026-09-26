import { NextResponse } from 'next/server';
import { owner, properties } from '@/lib/helpers/owner';
import { isSkill } from '@/lib/helpers/list';

/*
 * Create or edit the sharing row for one of Eric's tasks. Only fields present
 * in the body change. RLS on tasks and work_items scopes both to him.
 */
export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = String(b.task_id ?? '');
  const { data: task } = await o.db.from('tasks').select('id').eq('id', taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Unknown task' }, { status: 404 });

  const patch: Record<string, unknown> = { task_id: taskId, user_id: o.userId, updated_at: new Date().toISOString() };
  const text = (k: string) => {
    if (k in b) patch[k] = typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim() : null;
  };
  if ('shared' in b) patch.shared = Boolean(b.shared);
  if ('pinned' in b) patch.pinned = Boolean(b.pinned);
  if ('skill' in b) {
    if (!isSkill(b.skill)) return NextResponse.json({ error: 'Unknown skill' }, { status: 400 });
    patch.skill = b.skill;
  }
  ['instructions', 'materials', 'gift_card_note', 'assignee_name'].forEach(text);
  if ('assignee_worker_id' in b) {
    patch.assignee_worker_id = b.assignee_worker_id || null;
    if (patch.assignee_worker_id) patch.assignee_name = null;
  }
  if ('gift_card_sent' in b) patch.gift_card_sent_at = b.gift_card_sent ? new Date().toISOString() : null;
  if ('location_asset_id' in b) {
    const id = b.location_asset_id ? String(b.location_asset_id) : null;
    const prop = id ? (await properties(o.db)).find((p) => p.id === id) : null;
    if (id && !prop) return NextResponse.json({ error: 'Unknown property' }, { status: 400 });
    patch.location_asset_id = prop?.id ?? null;
    patch.location_label = prop?.label ?? null;
  }

  const { error } = await o.db.from('work_items').upsert(patch, { onConflict: 'task_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
