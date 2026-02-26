import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthLabReviewClient from '@/components/fitness/HealthLabReviewClient';
import { BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HealthLabReviewPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Get all lab panels with needs_review status
  const { data: pendingPanels } = await supabase
    .from('lab_panels')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('status', 'needs_review')
    .order('panel_date', { ascending: false });

  // Get confirmed panels (recent 10)
  const { data: confirmedPanels } = await supabase
    .from('lab_panels')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('status', 'confirmed')
    .order('panel_date', { ascending: false })
    .limit(10);

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
