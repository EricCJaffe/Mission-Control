import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthFileUploadClient from '@/components/fitness/HealthFileUploadClient';

export const dynamic = 'force-dynamic';

export default async function HealthFileUploadPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Check if health.md exists (required for lab processing)
  const { data: healthDoc } = await supabase
    .from('health_documents')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

  // Get recent uploads
  const { data: recentUploads } = await supabase
    .from('health_file_uploads')
    .select('id, file_type, file_name, uploaded_at, processing_status')
    .eq('user_id', userData.user.id)
    .order('uploaded_at', { ascending: false })
    .limit(10);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Upload Health Documents</h1>
        <p className="text-gray-600">
          Upload lab reports, methylation reports, doctor notes, and imaging results.
          AI will extract and analyze the data automatically.
        </p>
      </div>

      {!healthDoc && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Health profile not initialized.</strong> Please <a href="/fitness/health/init" className="underline">initialize your health profile</a> before uploading files.
          </p>
        </div>
      )}

      <HealthFileUploadClient
        healthDocExists={!!healthDoc}
        recentUploads={recentUploads || []}
      />
    </div>
  );
}
