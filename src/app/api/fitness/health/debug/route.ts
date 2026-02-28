import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check health_file_uploads for methylation reports
    const { data: files, error: filesError } = await supabase
      .from('health_file_uploads')
      .select('*')
      .eq('user_id', user.id)
      .eq('file_type', 'methylation_report')
      .order('created_at', { ascending: false });

    // Check genetic_markers
    const { data: markers, error: markersError } = await supabase
      .from('genetic_markers')
      .select('*')
      .eq('user_id', user.id);

    return NextResponse.json({
      files: files || [],
      files_count: files?.length || 0,
      files_error: filesError?.message,
      markers: markers || [],
      markers_count: markers?.length || 0,
      markers_error: markersError?.message,
    });

  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
