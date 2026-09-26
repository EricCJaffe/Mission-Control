import { NextResponse } from 'next/server';
import { claimAsHelper, currentHelper, releaseAsHelper } from '@/lib/helpers/server';

/* Take a job off the open board, or put one back. */
export async function POST(req: Request) {
  const h = await currentHelper();
  if (!h) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { task_id?: string; action?: string };
  if (!body.task_id || (body.action !== 'claim' && body.action !== 'release')) {
    return NextResponse.json({ error: 'task_id and action (claim or release) are required' }, { status: 400 });
  }
  try {
    if (body.action === 'claim') await claimAsHelper(h, body.task_id);
    else await releaseAsHelper(h, body.task_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
