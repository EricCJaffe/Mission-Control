'use client';

import { useState } from 'react';
import type { ExerciseCategory } from '@/lib/fitness/types';

type ExerciseRow = {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string | null;
  muscle_groups: string[];
  is_compound: boolean;
  is_template: boolean;
  user_id: string | null;
};

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio', 'mobility'];
const CAT_LABELS: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core', cardio: 'Cardio', mobility: 'Mobility',
};

export default function ExerciseLibraryClient({ exercises: initial }: { exercises: ExerciseRow[] }) {
  const [exercises, setExercises] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);

  const hasGlobalExercises = exercises.some(e => !e.user_id);

  async function handleSeed() {
    setSeeding(true); setError(null);
    try {
      const res = await fetch('/fitness/exercises/seed', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSeedDone(true);
        // Reload page to show seeded exercises
        window.location.reload();
      } else {
        setError(data.error || 'Failed to seed exercises');
      }
    } catch {
      setError('Network error — could not seed exercises');
    }
    setSeeding(false);
  }

  // Add form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('push');
  const [equipment, setEquipment] = useState('');
  const [isCompound, setIsCompound] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ExerciseCategory>('push');
  const [editEquipment, setEditEquipment] = useState('');
  const [editIsCompound, setEditIsCompound] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/fitness/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, equipment: equipment || null, is_compound: isCompound }),
      });
      const data = await res.json();
      if (data.ok) {
        setExercises(prev => [...prev, data.exercise]);
        setName(''); setEquipment(''); setIsCompound(false);
        setShowAdd(false);
      } else { setError(data.error || 'Failed to add exercise'); }
    } catch { setError('Network error — could not save'); }
    setSaving(false);
  }

  function startEdit(ex: ExerciseRow) {
    setEditingId(ex.id);
    setEditName(ex.name);
    setEditCategory(ex.category);
    setEditEquipment(ex.equipment || '');
    setEditIsCompound(ex.is_compound);
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/fitness/exercises', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName, category: editCategory, equipment: editEquipment || null, is_compound: editIsCompound }),
      });
      const data = await res.json();
      if (data.ok) {
        setExercises(prev => prev.map(e => e.id === editingId ? data.exercise : e));
        setEditingId(null);
      } else { setError(data.error || 'Failed to update exercise'); }
    } catch { setError('Network error — could not update'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/exercises?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setExercises(prev => prev.filter(e => e.id !== id));
        setConfirmDeleteId(null);
      } else { setError(data.error || 'Failed to delete exercise'); }
    } catch { setError('Network error — could not delete'); }
  }

  const grouped = new Map<string, ExerciseRow[]>();
  for (const cat of CATEGORIES) {
    grouped.set(cat, exercises.filter(e => e.category === cat));
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Add button / form */}
      {showAdd ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Add Custom Exercise</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Exercise name"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <select value={category} onChange={e => setCategory(e.target.value as ExerciseCategory)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="Equipment (optional)"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={isCompound} onChange={e => setIsCompound(e.target.checked)}
                className="rounded border-slate-200" />
              Compound movement
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !name.trim()}
              className="rounded-xl bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : 'Add Exercise'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Add Custom Exercise
        </button>
      )}

      {/* Categories */}
      {CATEGORIES.map(cat => {
        const catExercises = grouped.get(cat) ?? [];
        if (catExercises.length === 0) return null;
        return (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-slate-600 mb-2">{CAT_LABELS[cat]} ({catExercises.length})</h2>
            <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden divide-y divide-slate-100">
              {catExercises.map(e => (
                <div key={e.id}>
                  {editingId === e.id ? (
                    <div className="px-4 py-3 space-y-2 bg-slate-50">
                      <div className="grid gap-2 md:grid-cols-3">
                        <input value={editName} onChange={ev => setEditName(ev.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                        <select value={editCategory} onChange={ev => setEditCategory(ev.target.value as ExerciseCategory)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={editEquipment} onChange={ev => setEditEquipment(ev.target.value)} placeholder="Equipment"
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={editIsCompound} onChange={ev => setEditIsCompound(ev.target.checked)} className="rounded border-slate-200" />
                          Compound
                        </label>
                        <button onClick={handleUpdate} disabled={saving}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-800 flex-1">{e.name}</span>
                      {e.equipment && (
                        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{e.equipment}</span>
                      )}
                      {e.is_compound && (
                        <span className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">Compound</span>
                      )}
                      {e.user_id && (
                        <>
                          <span className="text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5">Custom</span>
                          <button onClick={() => startEdit(e)} className="text-xs text-slate-400 hover:text-blue-500">Edit</button>
                          {confirmDeleteId === e.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(e.id)} className="text-xs text-red-600 font-medium">Yes</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(e.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!hasGlobalExercises && !seedDone && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 text-center shadow-sm space-y-3">
          <p className="text-sm font-medium text-blue-800">No default exercises found</p>
          <p className="text-xs text-blue-600">Seed the library with 52 exercises across push, pull, legs, core, cardio, and mobility.</p>
          <button onClick={handleSeed} disabled={seeding}
            className="rounded-xl bg-blue-600 text-white text-sm font-medium px-6 py-2.5 hover:bg-blue-700 disabled:opacity-50 min-h-[44px]">
            {seeding ? 'Seeding...' : 'Seed Default Library'}
          </button>
        </div>
      )}

      {exercises.length === 0 && hasGlobalExercises === false && seedDone && (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-5 text-center shadow-sm">
          <p className="text-sm text-green-700">Exercises seeded! Reloading...</p>
        </div>
      )}
    </div>
  );
}
