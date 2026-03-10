import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { applyPersonaProposalToContent } from '@/lib/flourishing/coach';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const proposalIds = Array.isArray(body?.proposal_ids) ? body.proposal_ids.map(String).filter(Boolean) : [];
  if (proposalIds.length === 0) return NextResponse.json({ ok: false, error: 'proposal_ids required' }, { status: 400 });

  const { data: proposals, error: proposalError } = await supabase
    .from('persona_pending_updates')
    .select('*')
    .in('id', proposalIds)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (proposalError || !proposals || proposals.length === 0) {
    return NextResponse.json({ ok: false, error: proposalError?.message || 'No pending proposals found' }, { status: 404 });
  }

  const { data: currentPersona } = await supabase
    .from('notes')
    .select('id, content_md')
    .eq('user_id', user.id)
    .eq('title', 'persona')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let personaContent = currentPersona?.content_md || '';
  for (const proposal of proposals) {
    personaContent = applyPersonaProposalToContent(personaContent, {
      section_key: proposal.section_key,
      section_label: proposal.section_label,
      current_content: proposal.current_content,
      proposed_content: proposal.proposed_content,
      reason: proposal.reason,
      confidence: proposal.confidence,
    });
  }

  const timestamp = new Date().toISOString();
  if (currentPersona?.id) {
    await supabase.from('notes').update({ content_md: personaContent, updated_at: timestamp, tags: ['knowledge', 'persona'] }).eq('id', currentPersona.id);
  } else {
    await supabase.from('notes').insert({ user_id: user.id, title: 'persona', content_md: personaContent, tags: ['knowledge', 'persona'] });
  }

  const { data: existingProfile } = await supabase
    .from('persona_profiles')
    .select('id')
    .eq('org_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingProfile?.id) {
    await supabase
      .from('persona_profiles')
      .update({ title: 'Codex Persona', content_md: personaContent, mission_alignment: 'God First, Health, Family, Impact', updated_at: timestamp })
      .eq('id', existingProfile.id);
  } else {
    await supabase.from('persona_profiles').insert({ org_id: user.id, title: 'Codex Persona', content_md: personaContent, mission_alignment: 'God First, Health, Family, Impact' });
  }

  await supabase
    .from('persona_pending_updates')
    .update({ status: 'applied', reviewed_at: timestamp, reviewed_by: 'user', applied_at: timestamp })
    .in('id', proposalIds)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true, applied_count: proposalIds.length, content_length: personaContent.length });
}
