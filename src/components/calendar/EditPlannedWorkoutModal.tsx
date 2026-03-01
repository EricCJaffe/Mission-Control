'use client';

import { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';

export default function EditPlannedWorkoutModal({
  isOpen,
  onClose,
  plannedWorkoutId,
  initialTitle,
  initialDate,
  initialTime,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  plannedWorkoutId: string | null;
  initialTitle: string;
  initialDate: string; // YYYY-MM-DD
  initialTime: string; // HH:MM
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(initialTitle);
    setDate(initialDate);
    setTime(initialTime);
  }, [initialTitle, initialDate, initialTime, isOpen]);

  if (!isOpen || !plannedWorkoutId) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/planned-workouts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: plannedWorkoutId,
          scheduled_date: date,
          scheduled_time: time,
          day_label: title,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Error: ${json.error || 'Failed to update scheduled workout'}`);
        return;
      }
      onClose();
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to update scheduled workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Edit Scheduled Workout</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
