'use client';

import { useState } from 'react';
import { X, Dumbbell, Sparkles } from 'lucide-react';
import AIWorkoutBuilder from '@/components/fitness/AIWorkoutBuilder';

type WorkoutTemplate = {
  id: string;
  name: string;
  workout_type: string;
  description: string | null;
};

type ScheduleWorkoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string; // ISO date string
  templates: WorkoutTemplate[];
  onSuccess: () => void;
};

type Mode = 'template' | 'ai';

export default function ScheduleWorkoutModal({
  isOpen,
  onClose,
  defaultDate,
  templates,
  onSuccess,
}: ScheduleWorkoutModalProps) {
  const [mode, setMode] = useState<Mode>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/fitness/planned-workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduledDate,
          template_id: selectedTemplateId,
          notes,
        }),
      });

      if (response.ok) {
        onSuccess();
        onClose();
        // Reset form
        setSelectedTemplateId('');
        setNotes('');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to schedule workout'}`);
      }
    } catch (error) {
      console.error('Error scheduling workout:', error);
      alert('Failed to schedule workout');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAIWorkoutCreated = () => {
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Schedule Workout
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            onClick={() => setMode('template')}
            className={`
              flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors
              ${mode === 'template' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}
            `}
          >
            <Dumbbell className="h-4 w-4" />
            From Template
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`
              flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors
              ${mode === 'ai' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}
            `}
          >
            <Sparkles className="h-4 w-4" />
            AI Builder
          </button>
        </div>

        {/* Template Mode */}
        {mode === 'template' && (
          <form onSubmit={handleTemplateSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Scheduled Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.workout_type})
                  </option>
                ))}
              </select>
              {selectedTemplateId && (
                <p className="mt-1 text-xs text-slate-500">
                  {templates.find((t) => t.id === selectedTemplateId)?.description || ''}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                rows={3}
                placeholder="Add any notes for this workout..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedTemplateId}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
              >
                {isSubmitting ? 'Scheduling...' : 'Schedule Workout'}
              </button>
            </div>
          </form>
        )}

        {/* AI Builder Mode */}
        {mode === 'ai' && (
          <div>
            <AIWorkoutBuilder
              defaultDate={scheduledDate}
              onWorkoutCreated={handleAIWorkoutCreated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
