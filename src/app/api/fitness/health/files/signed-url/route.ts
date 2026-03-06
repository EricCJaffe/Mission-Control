import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fitness/health/files/signed-url?fileId=<health_file_uploads.id>
 * Returns a short-lived signed URL for the source health document.
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId');
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  try {
    const { data: upload, error: uploadError } = await supabase
      .from('health_file_uploads')
      .select('id, user_id, file_path, file_name, file_type')
      .eq('id', fileId)
      .eq('user_id', userData.user.id)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from('health-files')
      .createSignedUrl(upload.file_path, 60 * 10);

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      file: {
        id: upload.id,
        name: upload.file_name,
        type: upload.file_type,
      },
      signedUrl: signed.signedUrl,
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error('Signed URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
