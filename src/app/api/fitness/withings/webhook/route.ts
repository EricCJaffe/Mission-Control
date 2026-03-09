import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Withings webhook endpoint reserved for phase 2.' });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: 'Withings webhooks are not enabled yet.' }, { status: 202 });
}
