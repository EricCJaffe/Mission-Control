import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthFileUploadClient from '@/components/fitness/HealthFileUploadClient';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

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
    .select('id, file_type, file_name, created_at, processing_status')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Upload Health Documents</h1>
        <p className="text-gray-600">
          Upload lab reports, methylation reports, doctor notes, and imaging results.
          AI will extract and analyze the data automatically.
        </p>
        <div className="mt-3">
          <Link href="/fitness/health/imaging" className="text-sm text-blue-600 hover:underline">
            View Imaging Analyses →
          </Link>
        </div>
      </div>

      {!healthDoc && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <span className="inline-flex items-center gap-1.5"><AlertCircle size={16} /> <strong>Health profile not initialized.</strong> Please <a href="/fitness/health/init" className="underline">initialize your health profile</a> before uploading files.</span>
          </p>
        </div>
      )}

      <HealthFileUploadClient
        healthDocExists={!!healthDoc}
        recentUploads={(recentUploads || []).map((upload) => ({
          ...upload,
          uploaded_at: upload.created_at,
        }))}
      />
    </div>
  );
}
