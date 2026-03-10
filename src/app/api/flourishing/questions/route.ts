import { NextResponse } from 'next/server';
import { ensureDefaultQuestionSet } from '@/lib/flourishing/profile';

export const dynamic = 'force-dynamic';

export async function GET() {
  const questionSet = await ensureDefaultQuestionSet();
  return NextResponse.json({ ok: true, version: questionSet.version, questions: questionSet.questions });
}
