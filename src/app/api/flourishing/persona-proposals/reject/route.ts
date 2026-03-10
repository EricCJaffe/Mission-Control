import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const proposalIds = Array.isArray(body?.proposal_ids) ? body.proposal_ids.map(String).filter(Boolean) : [];
  if (proposalIds.length === 0) return NextResponse.json({ ok: false, error: 'proposal_ids required' }, { status: 400 });

  const { error } = await supabase
    .from('persona_pending_updates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: 'user' })
    .in('id', proposalIds)
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rejected_count: proposalIds.length });
}
