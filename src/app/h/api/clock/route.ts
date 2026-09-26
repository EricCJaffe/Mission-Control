import { NextResponse } from 'next/server';
import { clockAsHelper, currentHelper } from '@/lib/helpers/server';

export async function POST(req: Request) {
  const h = await currentHelper();
  if (!h) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; task_id?: string | null };
  if (body.action !== 'in' && body.action !== 'out') return NextResponse.json({ error: 'action is in or out' }, { status: 400 });
  try {
    await clockAsHelper(h, body.action, body.task_id ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
