import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { getFlourishingAssessment, getFlourishingHistory } from '@/lib/flourishing/profile';
import FlourishingAssessmentView from '@/components/flourishing/FlourishingAssessmentView';

export const dynamic = 'force-dynamic';

export default async function FlourishingAssessmentDetailPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [assessment, history] = await Promise.all([
    getFlourishingAssessment(user.id, assessmentId),
    getFlourishingHistory(user.id, 12),
  ]);

  if (!assessment) {
    return (
      <main className="pt-4 md:pt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Assessment not found</h1>
          <Link href="/flourishing" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Back to Flourishing</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-8 space-y-4">
      <Link href="/flourishing" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 shadow-sm">Back to Flourishing</Link>
      <FlourishingAssessmentView assessment={assessment} history={history} />
    </main>
  );
}
