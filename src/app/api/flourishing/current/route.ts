import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getFlourishingAssessment, getLatestFlourishingProfile, getPendingPersonaProposals } from '@/lib/flourishing/profile';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const profile = await getLatestFlourishingProfile(user.id);
  const latestAssessment = profile?.latest_assessment_id
    ? await getFlourishingAssessment(user.id, profile.latest_assessment_id)
    : null;
  const pendingPersonaProposals = await getPendingPersonaProposals(user.id);

  return NextResponse.json({ ok: true, profile, latest_assessment: latestAssessment, pending_persona_proposals: pendingPersonaProposals });
}
