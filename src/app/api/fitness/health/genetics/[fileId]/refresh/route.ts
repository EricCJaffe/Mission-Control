import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { refreshGeneticAnalysis, isGeneticReportType } from '@/lib/fitness/genetics-processor';

/**
 * POST /api/fitness/health/genetics/[fileId]/refresh
 * Re-generates AI analysis for a single genetic report file.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fileId) {
    return NextResponse.json({ error: 'fileId required' }, { status: 400 });
  }

  // Fetch the file upload to get report type
  const { data: fileUpload, error: fetchError } = await supabase
    .from('health_file_uploads')
    .select('id, file_type, processing_status')
    .eq('id', fileId)
    .eq('user_id', userData.user.id)
    .single();

  if (fetchError || !fileUpload) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const reportType = fileUpload.file_type;
  if (!isGeneticReportType(reportType)) {
    return NextResponse.json({ error: `File type "${reportType}" is not a supported genetic report type` }, { status: 400 });
  }

  const result = await refreshGeneticAnalysis({
    userId: userData.user.id,
    fileId,
    reportType,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Refresh failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, analysis: result.analysis });
}
