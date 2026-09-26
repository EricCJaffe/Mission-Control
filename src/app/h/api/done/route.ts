import { NextResponse } from 'next/server';
import { completeAsHelper, currentHelper } from '@/lib/helpers/server';

export async function POST(req: Request) {
  const h = await currentHelper();
  if (!h) return NextResponse.json({ error: 'Signed out' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { task_id?: string; note?: string };
  if (!body.task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  try {
    await completeAsHelper(h, body.task_id, body.note ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
