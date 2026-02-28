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

      // Build basic analysis from markers (until processing_metadata column is added)
      const geneList = Object.keys(markersByGene);
      const hasHighPriority = fileMarkers.some(m =>
        (m.risk_level === 'high' && ['MTHFR', 'COMT', 'CBS'].includes(m.gene)) ||
        m.gene === 'APOE'
      );

      const analysis = {
        summary: `Analysis of ${fileMarkers.length} genetic markers across ${geneList.length} genes: ${geneList.slice(0, 5).join(', ')}${geneList.length > 5 ? ', and others' : ''}.`,
        supplement_recommendations: [],
        lifestyle_recommendations: [],
        medication_notes: [],
        cardiac_relevance: hasHighPriority
          ? 'Several high-impact variants detected that may affect cardiovascular health, exercise response, and recovery.'
          : 'Review individual markers for specific cardiovascular implications.',
      };

      return {
        file_id: fileId,
        file_name: `Methylation Report (${new Date(firstMarker?.created_at || Date.now()).toLocaleDateString()})`,
        upload_date: firstMarker?.created_at,
        processing_status: 'completed',
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
