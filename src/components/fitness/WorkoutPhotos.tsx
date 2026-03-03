'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, X, Upload, Trash2 } from 'lucide-react';

type Photo = {
  id: string;
  file_name: string;
  photo_type: string;
  notes: string | null;
  url: string | null;
  created_at: string;
};

type Props = {
  workoutId: string;
};

export default function WorkoutPhotos({ workoutId }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/fitness/workouts/photos?workout_id=${workoutId}`)
      .then(res => res.json())
      .then(data => setPhotos(data.photos || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workoutId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workout_id', workoutId);
    formData.append('photo_type', 'other');

    try {
      const res = await fetch('/api/fitness/workouts/photos', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok && data.photo) {
        setPhotos(prev => [...prev, data.photo]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(photoId: string) {
    const res = await fetch(`/api/fitness/workouts/photos?id=${photoId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Session Photos {photos.length > 0 && `(${photos.length})`}
          </h3>
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium border border-blue-200 hover:bg-blue-100 cursor-pointer min-h-[32px]">
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Uploading...' : 'Add Photo'}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {loading && <p className="text-xs text-slate-400">Loading photos...</p>}

      {!loading && photos.length === 0 && (
        <p className="text-xs text-slate-400">No photos yet. Add form checks, progress shots, or workout highlights.</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative group">
              {photo.url ? (
                <button
                  onClick={() => setExpanded(photo.id)}
                  className="w-full aspect-square rounded-lg overflow-hidden bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.file_name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                  <Camera className="h-6 w-6 text-slate-300" />
                </div>
              )}
              <button
                onClick={() => handleDelete(photo.id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Expanded View */}
      {expanded && (() => {
        const photo = photos.find(p => p.id === expanded);
        if (!photo?.url) return null;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setExpanded(null)}>
            <div className="relative max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.file_name} className="max-h-[85vh] rounded-lg object-contain" />
              <button
                onClick={() => setExpanded(null)}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-5 w-5" />
              </button>
              {photo.notes && (
                <p className="absolute bottom-2 left-2 right-2 text-sm text-white bg-black/50 rounded-lg px-3 py-2">{photo.notes}</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
