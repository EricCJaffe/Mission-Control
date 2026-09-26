import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { HELPER_COOKIE, hashToken } from '@/lib/helpers/auth';
import { serviceClient } from '@/lib/helpers/server';

export async function POST() {
  const token = (await cookies()).get(HELPER_COOKIE)?.value;
  if (token) await serviceClient().from('helper_sessions').delete().eq('token_hash', hashToken(token));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HELPER_COOKIE, '', { path: '/h', maxAge: 0 });
  return res;
}
