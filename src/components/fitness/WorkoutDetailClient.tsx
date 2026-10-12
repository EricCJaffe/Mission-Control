'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Calendar, Clock, Zap, Heart, Repeat, Pencil, Save, X, Plus, Trash2 } from 'lucide-react';

type WorkoutLog = {
  id: string;
  workout_date: string;
  workout_type: string;
  duration_minutes: number | null;
  tss: number | null;
  rpe_session: number | null;
  notes: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  strain_score: number | null;
  compliance_pct: number | null;
  template_id: string | null;
};

type SetLog = {
  id: string;
  exercise_id: string | null;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  superset_group: string | null;
  superset_round: number | null;
  notes: string | null;
  completed?: boolean;
  exercises: {
    id: string;
    name: string;
    category: string;
    equipment: string | null;
  } | null;
};

type CardioLog = {
  activity_type: string;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr?: number | null;
  distance_miles: number | null;
  avg_pace_per_mile?: string | null;
  calories?: number | null;
  time_in_zone1_min: number | null;
  time_in_zone2_min: number | null;
  time_in_zone3_min: number | null;
  time_in_zone4_min: number | null;
};

type Props = {
  workout: WorkoutLog;
  sets: SetLog[];
  cardioData: CardioLog | null;
};

type SessionPhoto = {
  id: string;
  caption: string | null;
  created_at: string;
  signed_url: string | null;
};

export default function WorkoutDetailClient({ workout, sets, cardioData }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(workout.workout_date.slice(0, 10));
  const [editDuration, setEditDuration] = useState<number | ''>(workout.duration_minutes ?? '');
  const [editRpe, setEditRpe] = useState<number | ''>(workout.rpe_session ?? '');
  const [editNotes, setEditNotes] = useState(workout.notes ?? '');
  const [editSets, setEditSets] = useState(() => sets.map((set) => ({
    exercise_id: set.exercise_id,
    exercise_name: set.exercises?.name ?? 'Exercise',
    set_number: set.set_number,
    set_type: set.set_type,
    reps: set.reps ?? '',
    weight_lbs: set.weight_lbs ?? '',
    rpe: set.rpe ?? '',
    rest_seconds: set.rest_seconds ?? null,
    superset_group: set.superset_group,
    superset_round: set.superset_round,
    notes: set.notes ?? '',
    completed: set.completed ?? true,
  })));
  const [editCardio, setEditCardio] = useState(() => cardioData ? ({
    activity_type: cardioData.activity_type,
    avg_hr: cardioData.avg_hr ?? '',
    max_hr: cardioData.max_hr ?? '',
    distance_miles: cardioData.distance_miles ?? '',
    avg_pace_per_mile: cardioData.avg_pace_per_mile ?? '',
    calories: cardioData.calories ?? '',
    time_in_zone1_min: cardioData.time_in_zone1_min ?? '',
    time_in_zone2_min: cardioData.time_in_zone2_min ?? '',
    time_in_zone3_min: cardioData.time_in_zone3_min ?? '',
    time_in_zone4_min: cardioData.time_in_zone4_min ?? '',
  }) : null);
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/fitness/workout-photos?workout_id=${encodeURIComponent(workout.id)}`);
      const data = await res.json();
      if (res.ok && data.photos) {
        setPhotos(data.photos);
      } else {
        setPhotoError(data.error || 'Failed to load photos');
      }
    } catch {
      setPhotoError('Failed to load photos');
    } finally {
      setPhotosLoading(false);
    }
  }, [workout.id]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  function beginEditing() {
    setEditError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditDate(workout.workout_date.slice(0, 10));
    setEditDuration(workout.duration_minutes ?? '');
    setEditRpe(workout.rpe_session ?? '');
    setEditNotes(workout.notes ?? '');
    setEditSets(sets.map((set) => ({
      exercise_id: set.exercise_id,
      exercise_name: set.exercises?.name ?? 'Exercise',
      set_number: set.set_number,
      set_type: set.set_type,
      reps: set.reps ?? '',
      weight_lbs: set.weight_lbs ?? '',
      rpe: set.rpe ?? '',
      rest_seconds: set.rest_seconds ?? null,
      superset_group: set.superset_group,
      superset_round: set.superset_round,
      notes: set.notes ?? '',
      completed: set.completed ?? true,
    })));
    setEditCardio(cardioData ? {
      activity_type: cardioData.activity_type,
      avg_hr: cardioData.avg_hr ?? '',
      max_hr: cardioData.max_hr ?? '',
      distance_miles: cardioData.distance_miles ?? '',
      avg_pace_per_mile: cardioData.avg_pace_per_mile ?? '',
      calories: cardioData.calories ?? '',
      time_in_zone1_min: cardioData.time_in_zone1_min ?? '',
      time_in_zone2_min: cardioData.time_in_zone2_min ?? '',
      time_in_zone3_min: cardioData.time_in_zone3_min ?? '',
      time_in_zone4_min: cardioData.time_in_zone4_min ?? '',
    } : null);
    setEditing(false);
  }

  function updateEditSet(index: number, field: string, value: string | number | boolean) {
    setEditSets((current) => current.map((set, i) => i === index ? { ...set, [field]: value } : set));
  }

  function addEditSet() {
    const last = editSets[editSets.length - 1];
    setEditSets((current) => [...current, {
      exercise_id: last?.exercise_id ?? null,
      exercise_name: last?.exercise_name ?? 'Exercise',
      set_number: (last?.set_number ?? 0) + 1,
      set_type: 'working',
      reps: last?.reps ?? '',
      weight_lbs: last?.weight_lbs ?? '',
      rpe: '',
      rest_seconds: null,
      superset_group: last?.superset_group ?? null,
      superset_round: null,
      notes: '',
      completed: true,
    }]);
  }

  async function saveEdit() {
    if (savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch('/api/fitness/workouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workout.id,
          workout_date: editDate,
          duration_minutes: editDuration === '' ? null : Number(editDuration),
          rpe_session: editRpe === '' ? null : Number(editRpe),
          notes: editNotes.trim() || null,
          avg_hr: editCardio && editCardio.avg_hr !== '' ? Number(editCardio.avg_hr) : workout.avg_hr,
          max_hr: editCardio && editCardio.max_hr !== '' ? Number(editCardio.max_hr) : workout.max_hr,
          sets: editSets.map((set) => ({
            exercise_id: set.exercise_id,
            set_number: set.set_number,
            set_type: set.set_type,
            reps: set.reps === '' ? null : Number(set.reps),
            weight_lbs: set.weight_lbs === '' ? null : Number(set.weight_lbs),
            rpe: set.rpe === '' ? null : Number(set.rpe),
            rest_seconds: set.rest_seconds,
            superset_group: set.superset_group,
            superset_round: set.superset_round,
            notes: set.notes.trim() || null,
            completed: set.completed,
          })),
          ...(editCardio ? {
            cardio: {
              activity_type: editCardio.activity_type,
              avg_hr: editCardio.avg_hr === '' ? null : Number(editCardio.avg_hr),
              max_hr: editCardio.max_hr === '' ? null : Number(editCardio.max_hr),
              distance_miles: editCardio.distance_miles === '' ? null : Number(editCardio.distance_miles),
              avg_pace_per_mile: editCardio.avg_pace_per_mile || null,
              calories: editCardio.calories === '' ? null : Number(editCardio.calories),
              time_in_zone1_min: editCardio.time_in_zone1_min === '' ? null : Number(editCardio.time_in_zone1_min),
              time_in_zone2_min: editCardio.time_in_zone2_min === '' ? null : Number(editCardio.time_in_zone2_min),
              time_in_zone3_min: editCardio.time_in_zone3_min === '' ? null : Number(editCardio.time_in_zone3_min),
              time_in_zone4_min: editCardio.time_in_zone4_min === '' ? null : Number(editCardio.time_in_zone4_min),
            },
          } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save workout changes');
      router.refresh();
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save workout changes');
    } finally {
      setSavingEdit(false);
    }
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.set('workout_id', workout.id);
      form.set('file', file);
      if (photoCaption.trim()) form.set('caption', photoCaption.trim());

      const res = await fetch('/api/fitness/workout-photos', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setPhotoCaption('');
      await loadPhotos();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deletePhoto(photoId: string) {
    try {
      const res = await fetch(`/api/fitness/workout-photos?photo_id=${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  // Group sets by exercise
  const exerciseGroups = useMemo(() => {
    const grouped = new Map<string, {
      exercise_id: string;
      exercise_name: string;
      exercise_category: string;
      sets: SetLog[];
      superset_group: string | null;
    }>();

    for (const set of sets) {
      const key = set.superset_group || set.exercise_id || 'unknown';
      if (!grouped.has(key)) {
        grouped.set(key, {
          exercise_id: set.exercise_id || '',
          exercise_name: set.exercises?.name || 'Unknown Exercise',
          exercise_category: set.exercises?.category || '',
          sets: [],
          superset_group: set.superset_group,
        });
      }
      grouped.get(key)!.sets.push(set);
    }

    return Array.from(grouped.values());
  }, [sets]);

  const handleRepeatWorkout = () => {
    // Navigate to logger with this workout as a template
    if (workout.template_id) {
      router.push(`/fitness/log?template=${workout.template_id}`);
    } else {
      router.push(`/fitness/log?repeat=${workout.id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/fitness/history')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to History
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={beginEditing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={handleRepeatWorkout}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 min-h-[44px]"
          >
            <Repeat className="h-4 w-4" />
            Repeat Workout
          </button>
        </div>
      </div>

      {editing && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 shadow-sm md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Correct this session</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Edit workout record</h2>
              <p className="mt-1 text-xs text-slate-500">Fix the date, details, or a set. Your trend calculations will be refreshed from the corrected record.</p>
            </div>
            <button onClick={cancelEditing} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Cancel editing"><X className="h-5 w-5" /></button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-500">Date<input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-500">Duration (min)<input type="number" min={0} value={editDuration} onChange={(e) => setEditDuration(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-500">Session RPE<input type="number" min={1} max={10} value={editRpe} onChange={(e) => setEditRpe(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-500">Notes<textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>

          {editSets.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sets</p><button type="button" onClick={addEditSet} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"><Plus className="h-3.5 w-3.5" /> Add set</button></div>
              <div className="space-y-2">
                {editSets.map((set, index) => (
                  <div key={`${set.exercise_id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4rem_auto] items-center gap-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                    <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-700">{set.exercise_name}</p><p className="text-[10px] uppercase text-slate-400">Set {set.set_number} · {set.set_type}</p></div>
                    <input aria-label={`${set.exercise_name} weight`} type="number" inputMode="decimal" value={set.weight_lbs} onChange={(e) => updateEditSet(index, 'weight_lbs', e.target.value === '' ? '' : Number(e.target.value))} placeholder="lbs" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                    <input aria-label={`${set.exercise_name} reps`} type="number" inputMode="numeric" value={set.reps} onChange={(e) => updateEditSet(index, 'reps', e.target.value === '' ? '' : Number(e.target.value))} placeholder="reps" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                    <input aria-label={`${set.exercise_name} RPE`} type="number" min={1} max={10} value={set.rpe} onChange={(e) => updateEditSet(index, 'rpe', e.target.value === '' ? '' : Number(e.target.value))} placeholder="RPE" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                    <button type="button" onClick={() => setEditSets((current) => current.filter((_, i) => i !== index))} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-600" aria-label={`Remove set ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editCardio && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Cardio details</p>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                <label className="text-xs text-slate-500">Activity<input value={editCardio.activity_type} onChange={(e) => setEditCardio((c) => c ? { ...c, activity_type: e.target.value } : c)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" /></label>
                <label className="text-xs text-slate-500">Distance<input type="number" step="0.01" value={editCardio.distance_miles} onChange={(e) => setEditCardio((c) => c ? { ...c, distance_miles: e.target.value === '' ? '' : Number(e.target.value) } : c)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" /></label>
                <label className="text-xs text-slate-500">Avg HR<input type="number" value={editCardio.avg_hr} onChange={(e) => setEditCardio((c) => c ? { ...c, avg_hr: e.target.value === '' ? '' : Number(e.target.value) } : c)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" /></label>
                <label className="text-xs text-slate-500">Max HR<input type="number" value={editCardio.max_hr} onChange={(e) => setEditCardio((c) => c ? { ...c, max_hr: e.target.value === '' ? '' : Number(e.target.value) } : c)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" /></label>
              </div>
            </div>
          )}

          {editError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={cancelEditing} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"><Save className="h-4 w-4" />{savingEdit ? 'Saving…' : 'Save corrections'}</button>
          </div>
        </div>
      )}

      {/* Workout Summary Card */}
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 capitalize">{workout.workout_type} Workout</h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4" />
              {new Date(workout.workout_date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {workout.duration_minutes && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{workout.duration_minutes}m</p>
                <p className="text-xs text-slate-500">Duration</p>
              </div>
            </div>
          )}

          {workout.tss && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <Zap className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{workout.tss}</p>
                <p className="text-xs text-slate-500">TSS</p>
              </div>
            </div>
          )}

          {workout.rpe_session && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Heart className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{workout.rpe_session}/10</p>
                <p className="text-xs text-slate-500">RPE</p>
              </div>
            </div>
          )}

          {workout.avg_hr && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <Heart className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{workout.avg_hr}</p>
                <p className="text-xs text-slate-500">Avg HR</p>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        {workout.notes && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50">
            <p className="text-sm text-slate-700">{workout.notes}</p>
          </div>
        )}
      </div>

      {/* Cardio Data */}
      {cardioData && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Cardio Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cardioData.distance_miles && (
              <div>
                <p className="text-2xl font-bold text-slate-900">{cardioData.distance_miles.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Miles</p>
              </div>
            )}
            {cardioData.time_in_zone2_min && (
              <div>
                <p className="text-2xl font-bold text-green-600">{cardioData.time_in_zone2_min}</p>
                <p className="text-xs text-slate-500">Z2 Minutes</p>
              </div>
            )}
            {cardioData.max_hr && (
              <div>
                <p className="text-2xl font-bold text-red-600">{cardioData.max_hr}</p>
                <p className="text-xs text-slate-500">Max HR</p>
              </div>
            )}
            <div>
              <p className="text-2xl font-bold text-slate-900">{cardioData.activity_type}</p>
              <p className="text-xs text-slate-500">Activity</p>
            </div>
          </div>
        </div>
      )}

      {/* Session Photos */}
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Session Photos</h2>

        {photoError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {photoError}
          </div>
        )}

        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={photoCaption}
            onChange={(e) => setPhotoCaption(e.target.value)}
            placeholder="Optional caption..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 min-h-[44px]">
            {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingPhoto}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        {photosLoading ? (
          <p className="text-sm text-slate-500">Loading photos...</p>
        ) : photos.length === 0 ? (
          <p className="text-sm text-slate-500">No session photos yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-xl border border-slate-200 overflow-hidden">
                {photo.signed_url ? (
                  <div className="relative h-40 w-full">
                    <Image
                      src={photo.signed_url}
                      alt={photo.caption || 'Workout session photo'}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="h-40 w-full bg-slate-100" />
                )}
                <div className="p-2">
                  <p className="text-xs text-slate-500">
                    {new Date(photo.created_at).toLocaleString()}
                  </p>
                  {photo.caption && <p className="text-sm text-slate-700 mt-0.5">{photo.caption}</p>}
                  <button
                    onClick={() => deletePhoto(photo.id)}
                    className="mt-2 text-xs text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exercise Details */}
      {exerciseGroups.length > 0 && (
        <div className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Exercises</h2>
          </div>

          <div className="divide-y divide-slate-100">
            {exerciseGroups.map((group, idx) => {
              const totalVolume = group.sets.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight_lbs || 0)), 0);
              const maxWeight = Math.max(...group.sets.map(s => s.weight_lbs || 0));

              return (
                <div key={idx} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <button
                        onClick={() => router.push(`/fitness/exercises/${group.exercise_id}`)}
                        className="text-lg font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {group.exercise_name}
                      </button>
                      {group.superset_group && (
                        <span className="ml-2 text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                          Superset
                        </span>
                      )}
                      <p className="text-sm text-slate-500 mt-1">
                        {group.sets.length} sets • Max {maxWeight}lbs • Volume {totalVolume.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Sets Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                          <th className="pb-2 w-16">Set</th>
                          <th className="pb-2 w-24">Type</th>
                          <th className="pb-2 w-20">Weight</th>
                          <th className="pb-2 w-20">Reps</th>
                          <th className="pb-2 w-20">RPE</th>
                          <th className="pb-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {group.sets.map((set, setIdx) => (
                          <tr key={setIdx} className="text-slate-700">
                            <td className="py-2">{set.set_number}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                set.set_type === 'working' ? 'bg-slate-800 text-white' :
                                set.set_type === 'warmup' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {set.set_type}
                              </span>
                            </td>
                            <td className="py-2 font-medium">{set.weight_lbs || 0} lbs</td>
                            <td className="py-2 font-medium">{set.reps || 0}</td>
                            <td className="py-2">{set.rpe || '—'}</td>
                            <td className="py-2 text-xs text-slate-500">{set.notes || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
