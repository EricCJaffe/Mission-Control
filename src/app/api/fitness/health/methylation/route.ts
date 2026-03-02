import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all genetic markers for the user
    const { data: markers, error: markersError } = await supabase
      .from('genetic_markers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (markersError) {
      console.error('Error fetching genetic markers:', markersError);
      return NextResponse.json({ error: 'Failed to fetch genetic markers' }, { status: 500 });
    }

    // Get file uploads to find saved analysis
    // Use explicit column list to avoid PostgREST schema cache issues
    const uploadColumns = 'id, file_name, file_type, processing_status, error_message, file_path, processed_at';

    const { data: uploads } = await supabase
      .from('health_file_uploads')
      .select(uploadColumns)
      .eq('user_id', user.id)
      .eq('file_type', 'methylation_report')
      .in('processing_status', ['completed', 'needs_review']);

    // Try to load analysis_json via RPC (bypasses schema cache)
    let analysisMap: Record<string, Record<string, unknown>> = {};
    if (uploads && uploads.length > 0) {
      for (const upload of uploads) {
        try {
          const { data: analysisResult } = await supabase.rpc('get_file_upload_analysis', {
            p_file_id: upload.id,
            p_user_id: user.id,
          });
          if (analysisResult && analysisResult.analysis) {
            analysisMap[upload.id] = analysisResult.analysis;
          }
        } catch {
          // RPC may not exist yet, continue
        }
      }
    }

    // Group markers by file
    const fileIds = [...new Set(markers?.map(m => m.file_id).filter(Boolean))];

    const reportsByFile = fileIds.map(fileId => {
      const fileMarkers = markers?.filter(m => m.file_id === fileId) || [];
      const firstMarker = fileMarkers[0];

      // Group markers by gene
      const markersByGene: Record<string, typeof markers> = {};
      fileMarkers.forEach(marker => {
        if (!markersByGene[marker.gene]) {
          markersByGene[marker.gene] = [];
        }
        markersByGene[marker.gene].push(marker);
      });

      // Find matching upload record
      const upload = uploads?.find(u => u.id === fileId);

      // Use saved analysis if available, otherwise build basic summary
      const savedAnalysis = analysisMap[fileId];
      const geneList = Object.keys(markersByGene);

      const analysis = savedAnalysis || buildFallbackAnalysis(fileMarkers, geneList);

      return {
        file_id: fileId,
        file_name: upload?.file_name || `Methylation Report (${new Date(firstMarker?.created_at || Date.now()).toLocaleDateString()})`,
        upload_date: upload?.processed_at || firstMarker?.created_at,
        processing_status: upload?.processing_status || 'completed',
        analysis,
        marker_count: fileMarkers.length,
        markers: fileMarkers,
        markers_by_gene: markersByGene,
      };
    });

    return NextResponse.json({
      reports: reportsByFile,
      total_markers: markers?.length || 0,
    });

  } catch (error: any) {
    console.error('Methylation fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Build a basic fallback analysis from marker data when no saved AI analysis exists
 */
function buildFallbackAnalysis(
  fileMarkers: any[],
  geneList: string[]
): Record<string, unknown> {
  const highRisk = fileMarkers.filter(m => m.risk_level === 'high');
  const moderateRisk = fileMarkers.filter(m => m.risk_level === 'moderate');

  const supplementRecs: Array<Record<string, string>> = [];
  const lifestyleRecs: Array<Record<string, string>> = [];
  const medicationNotes: Array<Record<string, string>> = [];

  // Generate basic recommendations from marker data
  for (const marker of fileMarkers) {
    if (marker.supplement_implications) {
      supplementRecs.push({
        supplement: marker.supplement_implications,
        reason: `Based on ${marker.gene} ${marker.snp_id} (${marker.genotype})`,
        priority: marker.risk_level === 'high' ? 'high' : 'medium',
      });
    }
  }

  // Add known gene-specific recommendations
  const mthfrHigh = fileMarkers.find(m => m.gene === 'MTHFR' && m.risk_level === 'high');
  const mthfrMod = fileMarkers.find(m => m.gene === 'MTHFR' && m.risk_level === 'moderate');
  if (mthfrHigh) {
    supplementRecs.push({
      supplement: 'Methylfolate (5-MTHF)',
      reason: 'MTHFR homozygous variant significantly reduces folate metabolism',
      dosage: '800-1000 mcg daily',
      priority: 'high',
    });
  } else if (mthfrMod) {
    supplementRecs.push({
      supplement: 'Methylfolate (5-MTHF)',
      reason: 'MTHFR heterozygous variant moderately reduces folate metabolism',
      dosage: '400-800 mcg daily',
      priority: 'medium',
    });
  }

  const summary = highRisk.length > 0
    ? `Found ${highRisk.length} high-risk and ${moderateRisk.length} moderate-risk variants across ${geneList.length} genes. Key areas: ${geneList.slice(0, 5).join(', ')}. Review supplement and lifestyle recommendations below.`
    : `Analyzed ${fileMarkers.length} markers across ${geneList.length} genes (${geneList.slice(0, 5).join(', ')}${geneList.length > 5 ? ', and more' : ''}). ${moderateRisk.length} moderate-risk variants found.`;

  return {
    summary,
    supplement_recommendations: supplementRecs,
    lifestyle_recommendations: lifestyleRecs,
    medication_notes: medicationNotes,
    cardiac_relevance: highRisk.some(m => ['MTHFR', 'COMT', 'APOE'].includes(m.gene))
      ? 'Variants detected in genes related to cardiovascular health. MTHFR affects homocysteine metabolism (a cardiac risk factor), COMT affects stress response and blood pressure regulation.'
      : 'No high-impact cardiac-related variants detected. Continue standard cardiac monitoring.',
  };
}
