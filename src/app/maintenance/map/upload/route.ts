import path from 'path';
import { supabaseServer } from '@/lib/supabase/server';
import { back, text, withError } from '@/lib/maintenance/form';

export const runtime = 'nodejs';

const MAP = '/maintenance/map';

/*
 * Stores the aerial photo in the private `attachments` bucket, under the
 * owner's own folder (the bucket's policy allows nothing else), and points the
 * owner's one property map at it. The previous photo is removed once the new
 * one is in place, never before.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return back(req, '/login');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return back(req, withError(MAP, 'Choose a photo to upload.'));
  if (!file.type.startsWith('image/')) return back(req, withError(MAP, 'That file is not an image.'));

  const ext = path.extname(file.name || '').toLowerCase() || '.png';
  const storagePath = `${user.id}/property-map/${Date.now()}${ext}`;
  const { error: upErr } = await supabase.storage.from('attachments').upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return back(req, withError(MAP, upErr.message));

  const { data: old } = await supabase.from('property_maps').select('image_path').maybeSingle();
  const { error } = await supabase.from('property_maps').upsert({
    user_id: user.id,
    image_path: storagePath,
    address: text(form, 'address'),
    updated_at: new Date().toISOString(),
  });
  if (error) return back(req, withError(MAP, error.message));

  if (old?.image_path && old.image_path !== storagePath) {
    await supabase.storage.from('attachments').remove([old.image_path as string]);
  }
  return back(req, MAP);
}
