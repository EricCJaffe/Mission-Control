'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

type Props = {
  onExerciseCreated: (exerciseId: string, exerciseName: string) => void;
  onCancel: () => void;
};

const CATEGORIES = [
  'Push',
  'Pull',
  'Legs',
  'Core',
  'Cardio',
  'Mobility',
  'Other'
];

export default function QuickExerciseCreator({ onExerciseCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [equipment, setEquipment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Exercise name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/fitness/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category: category,
          equipment: equipment.trim() || null,
          muscle_groups: [],
          is_compound: false,
        }),
      });

      const data = await res.json();

      if (data.ok && data.exercise) {
        onExerciseCreated(data.exercise.id, data.exercise.name);
        // Reset form
        setName('');
        setCategory('Other');
        setEquipment('');
      } else {
        setError(data.error || 'Failed to create exercise');
      }
    } catch (err) {
      setError('Network error - could not create exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Create New Exercise</h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Exercise Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dumbbell Chest Press"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Equipment (optional)
            </label>
            <input
              type="text"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="e.g. Dumbbells, Barbell"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white font-medium px-4 py-2.5 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Creating...' : 'Create Exercise'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
