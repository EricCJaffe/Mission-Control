import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GENETIC_REPORT_TYPES, GENETIC_REPORT_LABELS, GeneticReportType } from '@/lib/fitness/genetics-processor';

export async function GET(request: NextRequest) {
  void request;
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all completed/needs_review uploads across all 6 genetic report types
    const uploadColumns = 'id, file_name, file_type, processing_status, error_message, file_path, processed_at, uploaded_at';
    const { data: uploads } = await supabase
      .from('health_file_uploads')
      .select(uploadColumns)
      .eq('user_id', user.id)
      .in('file_type', GENETIC_REPORT_TYPES as unknown as string[])
      .in('processing_status', ['completed', 'needs_review'])
      .order('processed_at', { ascending: false });

    // Load analysis_json for each upload via RPC (bypasses PostgREST schema cache)
    const analysisMap: Record<string, Record<string, unknown>> = {};
    if (uploads && uploads.length > 0) {
      for (const upload of uploads) {
        try {
          const { data: analysisResult } = await supabase.rpc('get_file_upload_analysis', {
            p_file_id: upload.id,
            p_user_id: user.id,
          });
          if (analysisResult?.analysis) {
            analysisMap[upload.id] = analysisResult.analysis;
          }
        } catch {
          // RPC may not exist, skip
        }
      }
    }

    // For methylation_report files: also load genetic markers (legacy + detail view)
    const methylationIds = (uploads || [])
      .filter(u => u.file_type === 'methylation_report')
      .map(u => u.id);

    let allMarkers: Record<string, unknown>[] = [];
    if (methylationIds.length > 0) {
      const { data: markers } = await supabase
        .from('genetic_markers')
        .select('*')
        .eq('user_id', user.id)
        .in('file_id', methylationIds)
        .order('gene');
      allMarkers = markers || [];
    }

    // Group markers by file_id
    const markersByFile: Record<string, Record<string, unknown>[]> = {};
    for (const marker of allMarkers) {
      const fid = marker.file_id as string;
      if (!markersByFile[fid]) markersByFile[fid] = [];
      markersByFile[fid].push(marker);
    }

    // Build unified report list
    const reports = (uploads || []).map(upload => {
      const analysis = analysisMap[upload.id] || null;
      const fileMarkers = markersByFile[upload.id] || [];

      // Group markers by gene (for methylation reports)
      const markersByGene: Record<string, Record<string, unknown>[]> = {};
      for (const marker of fileMarkers) {
        const gene = marker.gene as string;
        if (!markersByGene[gene]) markersByGene[gene] = [];
        markersByGene[gene].push(marker);
      }

      return {
        file_id: upload.id,
        file_name: upload.file_name,
        file_type: upload.file_type as GeneticReportType,
        file_type_label: GENETIC_REPORT_LABELS[upload.file_type as GeneticReportType] || upload.file_type,
        file_path: upload.file_path,
        processing_status: upload.processing_status,
        upload_date: upload.uploaded_at,
        processed_at: upload.processed_at,
        analysis,
        marker_count: fileMarkers.length,
        markers: fileMarkers,
        markers_by_gene: markersByGene,
      };
    });

    // Load cross-report comprehensive analysis
    let comprehensiveAnalysis: Record<string, unknown> | null = null;
    try {
      const { data: compResult } = await supabase.rpc('get_genetics_comprehensive_analysis', {
        p_user_id: user.id,
      });
      if (compResult?.found) {
        comprehensiveAnalysis = {
          analysis: compResult.analysis,
          file_ids: compResult.file_ids,
          report_types: compResult.report_types,
          generated_at: compResult.generated_at,
        };
      }
    } catch {
      // RPC may not exist yet
    }

    // Summary counts by report type
    const reportTypeCounts: Record<string, number> = {};
    for (const report of reports) {
      reportTypeCounts[report.file_type] = (reportTypeCounts[report.file_type] || 0) + 1;
    }

    return NextResponse.json({
      reports,
      comprehensive_analysis: comprehensiveAnalysis,
      total_markers: allMarkers.length,
      report_type_counts: reportTypeCounts,
      genetic_report_types: GENETIC_REPORT_TYPES,
      genetic_report_labels: GENETIC_REPORT_LABELS,
    });

  } catch (error: unknown) {
    console.error('Genetics fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
