import { NextResponse } from 'next/server';
import { jobsProjectId, owner, properties } from '@/lib/helpers/owner';
import { isSkill } from '@/lib/helpers/list';

/* A new one-off job: a task in the Home & Property Jobs project, shared. */
export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string | boolean | null>;
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 });
  const skill = isSkill(b.skill) ? b.skill : 'helper';
  const prop = b.location_asset_id ? (await properties(o.db)).find((p) => p.id === b.location_asset_id) ?? null : null;

  const now = new Date().toISOString();
  const { data: task, error } = await o.db
    .from('tasks')
    .insert({
      user_id: o.userId,
      project_id: await jobsProjectId(o.db, o.userId),
      title,
      status: 'todo',
      domain: 'family',
      source: 'manual',
      due_date: b.due_date || null,
      edited_at: now,
    })
    .select('id')
    .single();
  if (error || !task) return NextResponse.json({ error: error?.message ?? 'Could not create the task' }, { status: 500 });

  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const { error: e2 } = await o.db.from('work_items').insert({
    task_id: task.id,
    user_id: o.userId,
    shared: b.shared !== false,
    skill,
    location_asset_id: prop?.id ?? null,
    location_label: prop?.label ?? null,
    pinned: Boolean(b.pinned),
    assignee_worker_id: t(b.assignee_worker_id),
    assignee_name: b.assignee_worker_id ? null : t(b.assignee_name),
    instructions: t(b.instructions),
    materials: t(b.materials),
  });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, task_id: task.id });
}
