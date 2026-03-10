import { supabaseServer } from '@/lib/supabase/server';
import FlourishingClient from '@/components/flourishing/FlourishingClient';
import { ensureDefaultQuestionSet, getFlourishingAssessment, getFlourishingHistory, getLatestFlourishingProfile, getPendingPersonaProposals } from '@/lib/flourishing/profile';

export const dynamic = 'force-dynamic';

export default async function FlourishingPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [questionSet, profile, history, pendingPersonaProposals] = await Promise.all([
    ensureDefaultQuestionSet(),
    getLatestFlourishingProfile(user.id),
    getFlourishingHistory(user.id, 12),
    getPendingPersonaProposals(user.id),
  ]);

  const latestAssessment = profile?.latest_assessment_id ? await getFlourishingAssessment(user.id, profile.latest_assessment_id) : history[0] ?? null;

  return (
    <main className="pt-4 md:pt-8">
      <FlourishingClient
        questions={questionSet.questions}
        currentProfile={profile}
        latestAssessment={latestAssessment}
        history={history}
        pendingPersonaProposals={pendingPersonaProposals}
      />
    </main>
  );
}
