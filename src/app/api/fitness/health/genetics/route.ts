import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { refreshGeneticAnalysis, isGeneticReportType, GENETIC_REPORT_LABELS } from '@/lib/fitness/genetics-processor';

/**
 * GET - Fetch genetic markers for a specific file upload
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('file_id');

  if (!fileId) {
    return NextResponse.json({ error: 'file_id required' }, { status: 400 });
  }

  // Fetch markers for this file
  const { data: markers, error: markersError } = await supabase
    .from('genetic_markers')
    .select('*')
    .eq('file_id', fileId)
    .eq('user_id', userData.user.id)
    .order('gene');

  if (markersError) {
    return NextResponse.json({ error: 'Failed to fetch markers' }, { status: 500 });
  }

  // Fetch file upload record
  const { data: fileUpload } = await supabase
    .from('health_file_uploads')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userData.user.id)
    .single();

  return NextResponse.json({
    fileUpload,
    markers: markers || [],
  });
}

/**
 * PUT - Confirm genetic markers and generate analysis
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { file_id, confirm } = body;

  if (!file_id) {
    return NextResponse.json({ error: 'file_id required' }, { status: 400 });
  }

  if (confirm) {
    try {
      // Get the file upload to determine report type
      const { data: fileUpload } = await supabase
        .from('health_file_uploads')
        .select('file_type')
        .eq('id', file_id)
        .eq('user_id', userData.user.id)
        .single();

      const reportType = fileUpload?.file_type;
      let analysis: Record<string, unknown> | null = null;

      if (reportType && isGeneticReportType(reportType)) {
        // Load existing analysis_json (set during processing) — it's already there
        const { data: existingResult } = await supabase.rpc('get_file_upload_analysis', {
          p_file_id: file_id,
          p_user_id: userData.user.id,
        });
        analysis = existingResult?.analysis || null;

        // If no analysis yet (shouldn't happen but just in case), generate it
        if (!analysis) {
          const result = await refreshGeneticAnalysis({
            userId: userData.user.id,
            fileId: file_id,
            reportType,
          });
          analysis = result.analysis || null;
        }
      }

      // Mark as completed
      await supabase.rpc('update_file_upload_analysis', {
        p_file_id: file_id,
        p_user_id: userData.user.id,
        p_analysis: analysis,
      });

      const label = reportType && isGeneticReportType(reportType)
        ? GENETIC_REPORT_LABELS[reportType]
        : 'Genetic Report';

      return NextResponse.json({ success: true, analysis, report_type_label: label });

    } catch (error) {
      console.error('Failed to confirm genetic report:', error);
      await supabase
        .from('health_file_uploads')
        .update({ processing_status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', file_id)
        .eq('user_id', userData.user.id);

      return NextResponse.json({ success: true, analysis: null, warning: 'Confirmed but AI analysis failed' });
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE - Delete genetic markers for a file
 */
export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('file_id');

  if (!fileId) {
    return NextResponse.json({ error: 'file_id required' }, { status: 400 });
  }

  // Delete markers
  await supabase
    .from('genetic_markers')
    .delete()
    .eq('file_id', fileId)
    .eq('user_id', userData.user.id);

  // Update file status
  await supabase
    .from('health_file_uploads')
    .update({ processing_status: 'failed', error_message: 'Deleted by user' })
    .eq('id', fileId)
    .eq('user_id', userData.user.id);

  return NextResponse.json({ success: true });
}
