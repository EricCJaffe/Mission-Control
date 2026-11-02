/**
 * PATCH /api/fitness/running/recommendations/:id   `{ status, reviewer? }`
 *
 * Records the outcome of a coaching recommendation's review (e.g. after it was
 * taken to the cardiologist). Owner-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/fitness/running-api';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending_review', 'accepted', 'declined', 'done'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, denied } = await requireUser();
  if (!user) return denied;

  const body = await req.json().catch(() => null);
  if (!STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
  }
  const update: { status: string; updated_at: string; reviewer?: string | null } = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };
  if ('reviewer' in body) update.reviewer = typeof body.reviewer === 'string' && body.reviewer.trim() ? body.reviewer.trim().slice(0, 120) : null;

  const { data, error } = await supabase
    .from('coaching_recommendations')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
