'use client';

import { useState } from 'react';
import { Wand2, X, Plus, Loader2, AlertCircle, Lightbulb } from 'lucide-react';
import type { WorkoutStructureItem, Exercise } from '@/lib/fitness/types';

type AIWorkoutBuilderProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddExercises: (structure: WorkoutStructureItem[]) => void;
  mode: 'logger' | 'template';
};

type ParsedResult = {
  structure: WorkoutStructureItem[];
  unmatched_exercises: string[];
  suggestions: Array<{
    input: string;
    suggestions: Array<{ id: string; name: string; category: string; similarity: number }>;
  }>;
};

const EXAMPLE_PROMPTS = [
  "bench press 2 warm-up sets at 95lbs, 3 working sets at 135lbs, 1 drop set at 100lbs",
  "squat 5x5 at 225lbs, then deadlift 3x5 at 315lbs",
  "superset: pull-ups 3x10, barbell rows 3x10 at 95lbs",
  "incline press 4x8 at 115lbs, then add a superset with dumbbell flyes 3x12 at 30lbs and cable crossovers 3x15",
];

export default function AIWorkoutBuilder({ isOpen, onClose, onAddExercises, mode }: AIWorkoutBuilderProps) {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;

    setIsLoading(true);
    setError(null);
    setParsedResult(null);

    try {
      const response = await fetch('/api/fitness/ai/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        throw new Error('Failed to parse workout');
      }

      const data = await response.json();
      setParsedResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse workout');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    if (!parsedResult?.structure.length) return;
    onAddExercises(parsedResult.structure);
    onClose();
    // Reset state
    setDescription('');
    setParsedResult(null);
    setError(null);
  };

  const handleReset = () => {
    setDescription('');
    setParsedResult(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 shadow-lg">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-900">AI Workout Builder</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="mb-4 rounded-lg bg-blue-50 p-4">
          <div className="mb-2 flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-sm text-slate-700">
              <p className="mb-2 font-medium">Describe your workout in plain English. Examples:</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {EXAMPLE_PROMPTS.map((example, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="mr-1">•</span>
                    <button
                      onClick={() => setDescription(example)}
                      className="text-left hover:text-blue-600 hover:underline"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Workout Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., bench press 3x10 at 135lbs, squat 5x5 at 225lbs, then add a superset with pull-ups and rows"
            className="min-h-[120px] w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            disabled={isLoading}
          />
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={handleParse}
            disabled={!description.trim() || isLoading}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Parse Workout
              </>
            )}
          </button>
          {(parsedResult || error) && (
            <button
              onClick={handleReset}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900">Error parsing workout</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Parsed Result Preview */}
        {parsedResult && (
          <div className="space-y-4">
            {/* Unmatched Exercises Warning */}
            {parsedResult.unmatched_exercises.length > 0 && (
              <div className="rounded-lg bg-yellow-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900">
                      Some exercises could not be matched
                    </p>
                    <div className="mt-2 space-y-2">
                      {parsedResult.suggestions.map((sug, idx) => (
                        <div key={idx} className="text-xs">
                          <p className="font-medium text-yellow-800">"{sug.input}" not found</p>
                          {sug.suggestions.length > 0 && (
                            <p className="text-yellow-700">
                              Did you mean:{' '}
                              {sug.suggestions.map((s) => s.name).join(', ')}?
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Parsed Structure Preview */}
            {parsedResult.structure.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Parsed Workout ({parsedResult.structure.length}{' '}
                  {parsedResult.structure.length === 1 ? 'exercise' : 'items'})
                </h3>
                <div className="space-y-3">
                  {parsedResult.structure.map((item, idx) => (
                    <div key={idx} className="rounded-lg bg-white p-3 text-sm">
                      {item.type === 'standalone' ? (
                        <div>
                          <p className="font-medium text-slate-900">
                            {item.exercise?.name ?? 'Exercise'}
                          </p>
                          <p className="text-xs text-slate-600">
                            {item.sets.length} sets:{' '}
                            {item.sets.map((s) => s.type).join(', ')}
                          </p>
                          {item.sets.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs text-slate-600">
                              {item.sets.map((set, setIdx) => (
                                <div key={setIdx}>
                                  Set {setIdx + 1} ({set.type}):{' '}
                                  {set.target_reps ?? '?'} reps
                                  {set.target_weight ? ` @ ${set.target_weight}lbs` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-slate-900">
                            {item.group_name} ({item.rounds} rounds)
                          </p>
                          <div className="mt-1 space-y-1 text-xs text-slate-600">
                            {item.exercises.map((ex, exIdx) => (
                              <div key={exIdx}>
                                • {ex.exercise?.name ?? 'Exercise'}:{' '}
                                {ex.target_reps} reps
                                {ex.target_weight ? ` @ ${ex.target_weight}lbs` : ''}
                              </div>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Rest: {item.rest_between_exercises}s between exercises,{' '}
                            {item.rest_between_rounds}s between rounds
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Button */}
            {parsedResult.structure.length > 0 && (
              <button
                onClick={handleAdd}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
                Add to {mode === 'logger' ? 'Workout' : 'Template'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
