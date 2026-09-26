import { NextResponse } from 'next/server';
import { owner } from '@/lib/helpers/owner';
import { isSkill } from '@/lib/helpers/list';

/* Add or edit a person in the assignee list. */
export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(b.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  const skills = Array.isArray(b.skills) ? (b.skills as unknown[]).filter(isSkill) : ['helper'];
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const row = {
    user_id: o.userId,
    name,
    phone: t(b.phone),
    email: t(b.email),
    skills: skills.length ? skills : ['helper'],
    tracks_hours: Boolean(b.tracks_hours),
    hourly_rate: b.hourly_rate === '' || b.hourly_rate == null ? null : Number(b.hourly_rate),
    notes: t(b.notes),
    active: b.active !== false,
    updated_at: new Date().toISOString(),
  };
  const q = b.id ? o.db.from('workers').update(row).eq('id', String(b.id)) : o.db.from('workers').insert(row);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message.includes('workers_owner_name_idx') ? `${name} is already on the list` : error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
