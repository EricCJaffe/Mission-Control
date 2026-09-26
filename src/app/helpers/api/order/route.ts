import { NextResponse } from 'next/server';
import { owner } from '@/lib/helpers/owner';
import { sharedRows, workerNames } from '@/lib/helpers/server';
import { helperView } from '@/lib/helpers/list';
import { today } from '@/lib/day';

/*
 * Move a one-off job up or down the list. The order on the page IS the
 * priority, so this renumbers every shared one-off 1..n in the new order
 * rather than trying to squeeze a number between two others.
 */
export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { task_id?: string; direction?: string };
  const rows = await sharedRows(o.db, o.userId);
  const ids = helperView(rows, { worker_id: null, skills: null, includeBlocked: true }, await workerNames(o.db, o.userId), today()).oneOff.map((i) => i.id);
  const at = ids.indexOf(String(b.task_id));
  const to = b.direction === 'up' ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= ids.length) return NextResponse.json({ ok: true });
  [ids[at], ids[to]] = [ids[to], ids[at]];
  for (const [i, id] of ids.entries()) {
    await o.db.from('work_items').update({ sort_order: i + 1 }).eq('task_id', id);
  }
  return NextResponse.json({ ok: true });
}
