import { NextResponse } from 'next/server';
import { HELPER_COOKIE, LOCK_MINUTES, MAX_FAILURES, SESSION_DAYS, hashToken, newSessionToken, normalizeEmail, verifyPassword } from '@/lib/helpers/auth';
import { serviceClient } from '@/lib/helpers/server';

/*
 * Helper sign-in. One message for every failure — unknown email, wrong
 * password, disabled, locked — so the form cannot be used to learn which
 * emails have accounts.
 */
const FAIL = 'That email and password did not match.';
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(String(body.email ?? ''));
  const password = String(body.password ?? '');
  if (!email || !password) return NextResponse.json({ error: FAIL }, { status: 400 });

  const db = serviceClient();
  const { data: account } = await db
    .from('helper_accounts')
    .select('id,password_hash,disabled_at,failed_attempts,locked_until')
    .eq('email', email)
    .maybeSingle();

  if (!account || account.disabled_at) {
    // Spend the same scrypt time as a real check, so response time does not
    // tell anyone which emails have accounts.
    await verifyPassword(password, DUMMY_HASH);
    return NextResponse.json({ error: FAIL }, { status: 401 });
  }
  if (account.locked_until && new Date(account.locked_until as string) > new Date()) {
    return NextResponse.json({ error: `Too many tries. Wait ${LOCK_MINUTES} minutes, or ask Eric to reset your password.` }, { status: 429 });
  }

  if (!(await verifyPassword(password, account.password_hash as string))) {
    const failures = Number(account.failed_attempts ?? 0) + 1;
    await db
      .from('helper_accounts')
      .update({
        failed_attempts: failures >= MAX_FAILURES ? 0 : failures,
        locked_until: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq('id', account.id);
    return NextResponse.json({ error: FAIL }, { status: 401 });
  }

  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { error } = await db.from('helper_sessions').insert({ token_hash: hashToken(token), account_id: account.id, expires_at: expires.toISOString() });
  if (error) return NextResponse.json({ error: 'Could not sign in. Try again.' }, { status: 500 });
  await db.from('helper_accounts').update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq('id', account.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(HELPER_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/h', expires });
  return res;
}
