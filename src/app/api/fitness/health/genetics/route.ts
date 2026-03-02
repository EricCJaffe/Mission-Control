import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateMethylationAnalysis } from '@/lib/fitness/methylation-processor';

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
      // Generate AI analysis
      const analysis = await generateMethylationAnalysis({
        userId: userData.user.id,
        fileId: file_id,
      });

      // Save analysis to health_file_uploads and mark as completed
      // Use RPC to bypass PostgREST schema cache for new column
      const { error: updateError } = await supabase.rpc('update_file_upload_analysis', {
        p_file_id: file_id,
        p_user_id: userData.user.id,
        p_analysis: analysis || null,
      });

      if (updateError) {
        console.error('RPC update error, falling back to direct update:', updateError);
        // Fallback: update status without analysis_json column
        await supabase
          .from('health_file_uploads')
          .update({
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', file_id)
          .eq('user_id', userData.user.id);
      }

      return NextResponse.json({
        success: true,
        analysis,
      });
    } catch (error) {
      console.error('Failed to generate methylation analysis:', error);
      // Still mark as completed even if analysis fails — markers are saved
      await supabase
        .from('health_file_uploads')
        .update({
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', file_id)
        .eq('user_id', userData.user.id);

      return NextResponse.json({
        success: true,
        analysis: null,
        warning: 'Markers confirmed but AI analysis failed',
      });
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
