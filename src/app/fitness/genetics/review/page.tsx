import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import GeneticsReviewClient from '@/components/fitness/GeneticsReviewClient';
import { Dna } from 'lucide-react';
import { GENETIC_REPORT_TYPES } from '@/lib/fitness/genetics-processor';

export const dynamic = 'force-dynamic';

export default async function GeneticsReviewPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Use explicit column list to avoid PostgREST schema cache issues
  const uploadColumns = 'id, file_name, file_type, processing_status, error_message, file_path';

  // Get ALL genetic report types needing review (not just methylation)
  const { data: pendingUploads } = await supabase
    .from('health_file_uploads')
    .select(uploadColumns)
    .eq('user_id', userData.user.id)
    .in('file_type', [...GENETIC_REPORT_TYPES])
    .eq('processing_status', 'needs_review');

  // Get completed genetic uploads (all types)
  const { data: completedUploads } = await supabase
    .from('health_file_uploads')
    .select(uploadColumns)
    .eq('user_id', userData.user.id)
    .in('file_type', [...GENETIC_REPORT_TYPES])
    .eq('processing_status', 'completed')
    .limit(20);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Genetics Review</h1>
          <a
            href="/fitness/genetics"
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            <span className="inline-flex items-center gap-1.5"><Dna size={16} /> View All SNPs</span>
          </a>
        </div>
        <p className="text-gray-600">
          Review AI-extracted data from genetic reports before confirming.
        </p>
      </div>

      <GeneticsReviewClient
        pendingUploads={pendingUploads || []}
        completedUploads={completedUploads || []}
      />
    </div>
  );
}
