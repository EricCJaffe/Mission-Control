import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthLabReviewClient from '@/components/fitness/HealthLabReviewClient';
import { BarChart3 } from 'lucide-react';
import PersonSwitcher from '@/components/health/PersonSwitcher';
import { activePerson } from '@/lib/health/people';

export const dynamic = 'force-dynamic';

export default async function HealthLabReviewPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { person, people } = await activePerson(supabase, userData.user.id);

  // Panels predating the person column have person_id null and belong to the
  // account holder, so they stay visible under "Me".
  const scoped = (status: string, limit?: number) => {
    let q = supabase
      .from('lab_panels')
      .select('*')
      .eq('user_id', userData.user!.id)
      .eq('status', status)
      .order('panel_date', { ascending: false });
    if (person) {
      q = person.is_self
        ? q.or(`person_id.eq.${person.id},person_id.is.null`)
        : q.eq('person_id', person.id);
    }
    return limit ? q.limit(limit) : q;
  };

  const { data: pendingPanels } = await scoped('needs_review');
  const { data: confirmedPanels } = await scoped('confirmed', 10);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Lab Results Review</h1>
          <a
            href="/fitness/health/labs/dashboard"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            <span className="inline-flex items-center gap-1.5"><BarChart3 size={16} /> View Dashboard</span>
          </a>
        </div>
        <PersonSwitcher people={people} activeId={person?.id ?? null} />
        <p className="text-gray-600">
          Review AI-extracted lab data before finalizing. System auto-extracts panel metadata and test results from PDFs.
        </p>
      </div>

      <HealthLabReviewClient
        pendingPanels={pendingPanels || []}
        confirmedPanels={confirmedPanels || []}
      />
    </div>
  );
}
