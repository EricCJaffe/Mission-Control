'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2, AlertTriangle, Check, X } from 'lucide-react';

/** Mirrors ParsedWorkout / ParsedExercise from @/lib/fitness/workout-text-parser. */
type ParsedSet = {
  set_number: number;
  set_type: string;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  notes: string | null;
};
type ParsedExercise = {
  raw_name: string;
  exercise_id: string | null;
  matched_name: string | null;
  match_confidence: number;
  candidates: Array<{ id: string; name: string; similarity: number }>;
  sets: ParsedSet[];
};
type ParsedWorkout = {
  workout_type: string;
  workout_date: string | null;
  duration_minutes: number | null;
  rpe_session: number | null;
  notes: string | null;
  exercises: ParsedExercise[];
  warnings: string[];
};

const EXAMPLE = 'Bench 3x8 at 135, then rows 3x10 at 95, felt like a 7';

export default function WorkoutTextLogger() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parsing calls the AI, so it happens only on this explicit click — never on
  // mount, and never again while editing the preview below.
  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    setParsed(null);
    try {
      const res = await fetch('/api/fitness/workouts/log-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.ok) setParsed(data.parsed);
      else setError(data.error || 'Could not read that workout');
    } catch {
      setError('Network error — could not parse workout');
    }
    setParsing(false);
  }

  // Saving sends the confirmed preview back. No AI call, so corrections made
  // here are free.
  async function handleConfirm() {
    if (!parsed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/workouts/log-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed, confirm: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setParsed(null);
        setText('');
        router.refresh();
        router.push('/fitness/history');
      } else {
        setError(data.error || 'Could not save workout');
      }
    } catch {
      setError('Network error — could not save workout');
    }
    setSaving(false);
  }

  /** Resolve an unmatched exercise locally — no re-parse, no extra tokens. */
  function pickCandidate(exerciseIndex: number, candidateId: string) {
    setParsed(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const chosen = ex.candidates.find(c => c.id === candidateId);
        return chosen
          ? { ...ex, exercise_id: chosen.id, matched_name: chosen.name, match_confidence: 1 }
          : ex;
      });
      return { ...prev, exercises };
    });
  }

  const unresolved = parsed?.exercises.filter(e => !e.exercise_id) ?? [];
  const readyToSave = Boolean(parsed && parsed.exercises.length > 0 && unresolved.length === 0);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Wand2 className="h-5 w-5 text-blue-600" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Describe your workout
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Type it the way you&rsquo;d say it. You&rsquo;ll see exactly what gets logged before anything saves.
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={EXAMPLE}
        rows={3}
        className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={handleParse}
          disabled={parsing || !text.trim()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {parsing ? 'Reading…' : 'Read workout'}
        </button>
        {!text && (
          <button
            onClick={() => setText(EXAMPLE)}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Use an example
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {parsed && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="font-medium capitalize">{parsed.workout_type}</span>
            {parsed.duration_minutes != null && <span>{parsed.duration_minutes} min</span>}
            {parsed.rpe_session != null && <span>Session RPE {parsed.rpe_session}</span>}
            {parsed.workout_date && <span>{parsed.workout_date}</span>}
          </div>

          {parsed.warnings.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
              {parsed.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {parsed.exercises.map((ex, i) => (
            <div key={`${ex.raw_name}-${i}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {ex.matched_name ?? ex.raw_name}
                  </p>
                  {ex.matched_name && ex.matched_name.toLowerCase() !== ex.raw_name.toLowerCase() && (
                    <p className="text-xs text-slate-400">you said &ldquo;{ex.raw_name}&rdquo;</p>
                  )}
                </div>
                {ex.exercise_id ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> matched
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> needs a match
                  </span>
                )}
              </div>

              {/* Unmatched: choose locally rather than re-parsing. */}
              {!ex.exercise_id && (
                <div className="mt-2">
                  {ex.candidates.length > 0 ? (
                    <select
                      onChange={e => e.target.value && pickCandidate(i, e.target.value)}
                      defaultValue=""
                      className="w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-xs min-h-[40px]"
                    >
                      <option value="" disabled>
                        Pick the exercise you meant…
                      </option>
                      {ex.candidates.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({Math.round(c.similarity * 100)}% match)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Nothing in your library resembles this. Add it in the exercise library first.
                    </p>
                  )}
                </div>
              )}

              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left font-medium">Set</th>
                    <th className="text-left font-medium">Reps</th>
                    <th className="text-left font-medium">Weight</th>
                    <th className="text-left font-medium">RPE</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((s, si) => (
                    <tr key={si} className="text-slate-700">
                      <td className="py-0.5">
                        {si + 1}
                        {s.set_type !== 'working' && (
                          <span className="ml-1 text-slate-400">{s.set_type}</span>
                        )}
                      </td>
                      <td>{s.reps ?? '—'}</td>
                      <td>{s.weight_lbs != null ? `${s.weight_lbs} lb` : 'bodyweight'}</td>
                      <td>{s.rpe ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={!readyToSave || saving}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Log this workout'}
            </button>
            <button
              onClick={() => {
                setParsed(null);
                setError(null);
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Discard
            </button>
            {!readyToSave && unresolved.length > 0 && (
              <span className="text-xs text-amber-700">
                Match {unresolved.length} exercise{unresolved.length === 1 ? '' : 's'} to continue
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
