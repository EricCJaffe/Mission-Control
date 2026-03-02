import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fitness/health/files/signed-url?fileId=<uuid>
 *
 * Generates a short-lived signed URL for viewing a health file (PDF/image)
 * stored in Supabase Storage. Validates user ownership before generating.
 */
export async function GET(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  try {
    // Verify user owns this file
    const { data: file, error: fileError } = await supabase
      .from('health_file_uploads')
      .select('id, file_path, file_name, file_type, user_id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('health-files')
      .createSignedUrl(file.file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Signed URL error:', signedUrlError);
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      url: signedUrlData.signedUrl,
      file_name: file.file_name,
    });
  } catch (error) {
    console.error('File signed URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
