import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * GET /api/fitness/workouts/photos?workout_id=<uuid>
 * Returns photos for a workout with signed URLs.
 */
export async function GET(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workoutId = request.nextUrl.searchParams.get('workout_id');
  if (!workoutId) return NextResponse.json({ error: 'workout_id required' }, { status: 400 });

  const { data: photos } = await supabase
    .from('workout_photos')
    .select('*')
    .eq('workout_log_id', workoutId)
    .eq('user_id', user.id)
    .order('display_order');

  if (!photos || photos.length === 0) {
    return NextResponse.json({ photos: [] });
  }

  // Generate signed URLs for each photo
  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => {
      const { data } = await supabase.storage
        .from('health-files')
        .createSignedUrl(photo.file_path, 3600);
      return { ...photo, url: data?.signedUrl || null };
    })
  );

  return NextResponse.json({ photos: photosWithUrls });
}

/**
 * POST /api/fitness/workouts/photos
 * Upload a photo to a workout session.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const workoutId = formData.get('workout_id') as string;
  const photoType = (formData.get('photo_type') as string) || 'other';
  const notes = formData.get('notes') as string | null;

  if (!file || !workoutId) {
    return NextResponse.json({ error: 'file and workout_id are required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and HEIC images are allowed' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 10 MB' }, { status: 400 });
  }

  // Verify workout belongs to user
  const { data: workout } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', user.id)
    .single();

  if (!workout) {
    return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
  }

  try {
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${user.id}/workout_photos/${Date.now()}_${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('health-files')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: photo, error: insertError } = await supabase
      .from('workout_photos')
      .insert({
        user_id: user.id,
        workout_log_id: workoutId,
        file_path: filePath,
        file_name: file.name,
        photo_type: photoType,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save photo record' }, { status: 500 });
    }

    // Return with signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('health-files')
      .createSignedUrl(filePath, 3600);

    return NextResponse.json({
      ok: true,
      photo: { ...photo, url: signedUrlData?.signedUrl || null },
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/fitness/workouts/photos?id=<uuid>
 * Delete a workout photo.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const photoId = request.nextUrl.searchParams.get('id');
  if (!photoId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: photo } = await supabase
    .from('workout_photos')
    .select('file_path')
    .eq('id', photoId)
    .eq('user_id', user.id)
    .single();

  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

  // Delete from storage
  await supabase.storage.from('health-files').remove([photo.file_path]);

  // Delete from database
  await supabase
    .from('workout_photos')
    .delete()
    .eq('id', photoId)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
