import { NextResponse } from 'next/server';
import { owner } from '@/lib/helpers/owner';
import { serviceClient } from '@/lib/helpers/server';
import { MIN_PASSWORD, hashPassword, normalizeEmail, temporaryPassword } from '@/lib/helpers/auth';

/*
 * A worker's login: create, reset the password, disable, enable. Eric sets a
 * password or takes the generated one, which is returned ONCE and stored only
 * as a hash. Credentials go through the service role (the table has no RLS
 * policy), always filtered to Eric's own workers.
 */
export async function POST(req: Request) {
  const o = await owner();
  if (!o) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { worker_id?: string; action?: string; email?: string; password?: string };

  const { data: worker } = await o.db.from('workers').select('id,email').eq('id', String(b.worker_id ?? '')).maybeSingle();
  if (!worker) return NextResponse.json({ error: 'Unknown person' }, { status: 404 });

  const db = serviceClient();
  const { data: existing } = await db.from('helper_accounts').select('id').eq('worker_id', worker.id).eq('user_id', o.userId).maybeSingle();

  if (b.action === 'disable' || b.action === 'enable') {
    if (!existing) return NextResponse.json({ error: 'No login yet' }, { status: 404 });
    await db.from('helper_accounts').update({ disabled_at: b.action === 'disable' ? new Date().toISOString() : null }).eq('id', existing.id);
    if (b.action === 'disable') await db.from('helper_sessions').delete().eq('account_id', existing.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action !== 'create' && b.action !== 'reset') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const password = b.password?.trim() || temporaryPassword();
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Passwords need at least ${MIN_PASSWORD} characters` }, { status: 400 });
  const hash = await hashPassword(password);

  if (b.action === 'reset') {
    if (!existing) return NextResponse.json({ error: 'No login yet' }, { status: 404 });
    await db.from('helper_accounts').update({ password_hash: hash, failed_attempts: 0, locked_until: null }).eq('id', existing.id);
    // A reset signs them out everywhere: the old password may be on a lost phone.
    await db.from('helper_sessions').delete().eq('account_id', existing.id);
    return NextResponse.json({ ok: true, password });
  }

  if (existing) return NextResponse.json({ error: 'They already have a login; reset it instead' }, { status: 400 });
  const email = normalizeEmail(b.email || (worker.email as string | null) || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  const { error } = await db.from('helper_accounts').insert({ user_id: o.userId, worker_id: worker.id, email, password_hash: hash });
  if (error) return NextResponse.json({ error: error.message.includes('email') ? 'That email already has a login' : error.message }, { status: 400 });
  return NextResponse.json({ ok: true, password, email });
}
