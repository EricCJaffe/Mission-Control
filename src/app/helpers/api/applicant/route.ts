import { NextResponse } from 'next/server';
import { owner } from '@/lib/helpers/owner';

/*
 * Act on a job application: set its status, or add the person to the people
 * list (a worker with the helper skill, no login). A login is still a separate,
 * deliberate step on /helpers: applying never creates one.
 */
const STATUSES = ['new', 'contacted', 'hired', 'declined'];

export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; status?: string };
  const { data: app } = await o.db.from('job_applications').select('id,name,phone,email,experience,availability,worker_id').eq('id', String(b.id ?? '')).maybeSingle();
  if (!app) return NextResponse.json({ error: 'Unknown application' }, { status: 404 });

  if (b.action === 'status') {
    if (!STATUSES.includes(String(b.status))) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    await o.db.from('job_applications').update({ status: b.status }).eq('id', app.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'add') {
    if (app.worker_id) return NextResponse.json({ ok: true });
    const notes = [app.availability && `Available: ${app.availability}`, app.experience && `Experience: ${app.experience}`].filter(Boolean).join(' · ') || null;
    const { data: w, error } = await o.db
      .from('workers')
      .insert({ user_id: o.userId, name: app.name, phone: app.phone, email: app.email, skills: ['helper'], notes: notes?.slice(0, 500) ?? null })
      .select('id')
      .single();
    if (error || !w) return NextResponse.json({ error: error?.message.includes('workers_owner_name_idx') ? `${app.name} is already on the people list` : error?.message }, { status: 400 });
    await o.db.from('job_applications').update({ worker_id: w.id, status: 'hired' }).eq('id', app.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
