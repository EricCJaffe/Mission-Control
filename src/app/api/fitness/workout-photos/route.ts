import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workoutId = searchParams.get('workout_id');
  if (!workoutId) return NextResponse.json({ error: 'workout_id required' }, { status: 400 });

  const { data: photos, error } = await supabase
    .from('workout_session_photos')
    .select('id, file_path, caption, created_at, workout_log_id')
    .eq('user_id', user.id)
    .eq('workout_log_id', workoutId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all((photos || []).map(async (p) => {
    const { data: signed } = await supabase.storage.from('health-files').createSignedUrl(p.file_path, 60 * 10);
    return {
      id: p.id,
      caption: p.caption,
      created_at: p.created_at,
      signed_url: signed?.signedUrl || null,
    };
  }));

  return NextResponse.json({ ok: true, photos: withUrls });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const workoutId = form.get('workout_id') as string | null;
  const caption = form.get('caption') as string | null;
  const file = form.get('file') as File | null;

  if (!workoutId || !file) {
    return NextResponse.json({ error: 'workout_id and file are required' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
  }

  const { data: workout } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!workout) {
    return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${user.id}/workout-sessions/${workoutId}/${Date.now()}_${safeName}`;
  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('health-files')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: photo, error: insertError } = await supabase
    .from('workout_session_photos')
    .insert({
      user_id: user.id,
      workout_log_id: workoutId,
      file_path: storagePath,
      caption: caption?.trim() || null,
    })
    .select('id, caption, created_at')
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: signed } = await supabase.storage.from('health-files').createSignedUrl(storagePath, 60 * 10);
  return NextResponse.json({
    ok: true,
    photo: {
      ...photo,
      signed_url: signed?.signedUrl || null,
    },
  });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const photoId = searchParams.get('photo_id');
  if (!photoId) return NextResponse.json({ error: 'photo_id required' }, { status: 400 });

  const { data: photo, error: loadError } = await supabase
    .from('workout_session_photos')
    .select('id, file_path')
    .eq('id', photoId)
    .eq('user_id', user.id)
    .single();

  if (loadError || !photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

  await supabase.storage.from('health-files').remove([photo.file_path]);
  const { error } = await supabase
    .from('workout_session_photos')
    .delete()
    .eq('id', photoId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
