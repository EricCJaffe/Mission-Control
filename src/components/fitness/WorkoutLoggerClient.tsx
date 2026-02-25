'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import RestTimer from './RestTimer';
import PlateCalculator from './PlateCalculator';
import type { SetType, CardioLog } from '@/lib/fitness/types';

type ExerciseRow = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  muscle_groups: string[];
  is_compound: boolean;
};

type TemplateRow = {
  id: string;
  name: string;
  type: string | null;
  split_type: string | null;
  structure: unknown;
  estimated_duration_min: number | null;
};

type Props = {
  exercises: ExerciseRow[];
  templates: TemplateRow[];
  todayPlan: {
    id: string;
    day_label?: string | null;
    workout_type?: string | null;
    prescribed: Record<string, unknown>;
    template_id?: string | null;
  } | null;
  latestMetrics: {
    body_battery: number | null;
    hrv_ms: number | null;
    resting_hr: number | null;
    sleep_score: number | null;
  } | null;
};

type LoggedSet = {
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  set_type: SetType;
  reps: number | '';
  weight_lbs: number | '';
  rpe: number | '';
  rest_seconds: number | null;
  superset_group: string | null;
  superset_round: number | null;
  notes: string;
};

type WorkoutMode = 'select' | 'logging' | 'cardio' | 'complete';

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Warm',
  working: 'Work',
  cooldown: 'Cool',
  drop: 'Drop',
  failure: 'Fail',
  amrap: 'AMRAP',
};

const SET_TYPE_COLORS: Record<SetType, string> = {
  warmup: 'bg-blue-100 text-blue-700',
  working: 'bg-slate-800 text-white',
  cooldown: 'bg-green-100 text-green-700',
  drop: 'bg-purple-100 text-purple-700',
  failure: 'bg-red-100 text-red-700',
  amrap: 'bg-orange-100 text-orange-700',
};

export default function WorkoutLoggerClient({ exercises, templates, todayPlan, latestMetrics }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<WorkoutMode>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [workoutType, setWorkoutType] = useState<string>(todayPlan?.workout_type ?? 'strength');
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [currentExerciseId, setCurrentExerciseId] = useState<string>('');
  const [duration, setDuration] = useState<number | ''>('');
  const [rpeSession, setRpeSession] = useState<number | ''>('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [cardioData, setCardioData] = useState<Partial<CardioLog>>({ activity_type: 'run' });
  const [saving, setSaving] = useState(false);
  const [newPRs, setNewPRs] = useState<string[]>([]);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [hrRecovery2min, setHrRecovery2min] = useState<number | ''>('');
  const [avgHr, setAvgHr] = useState<number | ''>('');
  const [maxHr, setMaxHr] = useState<number | ''>('');
  const [completionData, setCompletionData] = useState<{
    strain_score?: number;
    cardiac_efficiency?: { efficiency_value: number; efficiency_type: string } | null;
    recovery?: { hours_to_ready: number; next_hard_date: string; suggested_next: string } | null;
    estimated_1rms?: Array<{ exercise: string; weight: number; reps: number; estimated_1rm: number }>;
  } | null>(null);

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  const addSet = useCallback(() => {
    if (!currentExerciseId) return;
    const exercise = exerciseMap.get(currentExerciseId);
    if (!exercise) return;

    const existingSets = sets.filter((s) => s.exercise_id === currentExerciseId);
    const setNum = existingSets.length + 1;
    const setType: SetType = setNum === 1 ? 'warmup' : 'working';

    // Pre-fill weight from last set of this exercise
    const lastSet = existingSets[existingSets.length - 1];

    setSets((prev) => [
      ...prev,
      {
        exercise_id: currentExerciseId,
        exercise_name: exercise.name,
        set_number: setNum,
        set_type: setType,
        reps: lastSet?.reps ?? '',
        weight_lbs: lastSet?.weight_lbs ?? '',
        rpe: '',
        rest_seconds: null,
        superset_group: null,
        superset_round: null,
        notes: '',
      },
    ]);
  }, [currentExerciseId, sets, exerciseMap]);

  const updateSet = useCallback((idx: number, field: keyof LoggedSet, value: unknown) => {
    setSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const removeSet = useCallback((idx: number) => {
    setSets((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const saveWorkout = async () => {
    if (saving) return;
    setSaving(true);

    const payload = {
      planned_workout_id: todayPlan?.id ?? null,
      template_id: selectedTemplate?.id ?? null,
      workout_type: workoutType,
      duration_minutes: duration !== '' ? Number(duration) : null,
      rpe_session: rpeSession !== '' ? Number(rpeSession) : null,
      notes: sessionNotes || null,
      avg_hr: avgHr !== '' ? Number(avgHr) : null,
      max_hr: maxHr !== '' ? Number(maxHr) : null,
      sets: sets.map((s) => ({
        exercise_id: s.exercise_id || null,
        set_number: s.set_number,
        set_type: s.set_type,
        reps: s.reps !== '' ? Number(s.reps) : null,
        weight_lbs: s.weight_lbs !== '' ? Number(s.weight_lbs) : null,
        rpe: s.rpe !== '' ? Number(s.rpe) : null,
        rest_seconds: s.rest_seconds,
        superset_group: s.superset_group,
        superset_round: s.superset_round,
        is_pr: false,
        notes: s.notes || null,
      })),
      cardio: (workoutType === 'cardio' || workoutType === 'hybrid')
        ? { ...cardioData, hr_recovery_2min: hrRecovery2min !== '' ? Number(hrRecovery2min) : undefined }
        : null,
    };

    try {
      const res = await fetch('/fitness/log/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.new_prs?.length > 0) setNewPRs(data.new_prs);
        setCompletionData({
          strain_score: data.strain_score,
          cardiac_efficiency: data.cardiac_efficiency,
          recovery: data.recovery,
          estimated_1rms: data.estimated_1rms,
        });
        setMode('complete');
      }
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  // ——— SCREEN: Select mode ———
  if (mode === 'select') {
    return (
      <div className="space-y-4">
        {latestMetrics?.body_battery != null && latestMetrics.body_battery < 25 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">⚠️ Low Body Battery ({latestMetrics.body_battery}/100)</p>
            <p className="text-xs text-orange-700 mt-0.5">Consider a recovery walk or rest day instead of intense training.</p>
          </div>
        )}

        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Start Workout</h2>

          <div className="mb-4">
            <label className="text-xs text-slate-500 block mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {(['strength', 'cardio', 'hiit', 'hybrid'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setWorkoutType(t)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium min-h-[44px] capitalize ${
                    workoutType === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {templates.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-slate-500 block mb-2">Template (optional)</label>
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value) ?? null;
                  setSelectedTemplate(t);
                  if (t) setWorkoutType(t.type ?? workoutType);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              >
                <option value="">— No template (blank) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {todayPlan && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700">Today's Plan: {todayPlan.day_label ?? todayPlan.workout_type}</p>
            </div>
          )}

          <button
            onClick={() => setMode(workoutType === 'cardio' ? 'cardio' : 'logging')}
            className="w-full rounded-xl bg-slate-800 text-white text-sm font-semibold py-3 hover:bg-slate-700 min-h-[44px]"
          >
            Start Workout
          </button>
        </div>
      </div>
    );
  }

  // ——— SCREEN: Complete ———
  if (mode === 'complete') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
          <p className="text-4xl mb-3">✅</p>
          <h2 className="text-xl font-bold text-green-800 mb-2">Workout Saved!</h2>
          {newPRs.length > 0 && (
            <div className="mt-3 mb-4">
              <p className="text-sm font-semibold text-green-700 mb-1">New Personal Records!</p>
              {newPRs.map((pr) => (
                <p key={pr} className="text-sm text-green-700">{pr}</p>
              ))}
            </div>
          )}
        </div>

        {/* Post-workout stats */}
        {completionData && (
          <div className="grid grid-cols-2 gap-3">
            {completionData.strain_score != null && (
              <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Workout Strain</p>
                <p className="text-2xl font-bold">{completionData.strain_score.toFixed(1)}</p>
                <p className="text-xs text-slate-400">/ 21</p>
              </div>
            )}
            {completionData.cardiac_efficiency && (
              <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Cardiac Efficiency</p>
                <p className="text-2xl font-bold">{completionData.cardiac_efficiency.efficiency_value.toFixed(3)}</p>
                <p className="text-xs text-slate-400">{completionData.cardiac_efficiency.efficiency_type}</p>
              </div>
            )}
          </div>
        )}

        {/* Estimated 1RMs */}
        {completionData?.estimated_1rms && completionData.estimated_1rms.length > 0 && (
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Estimated 1RMs</h3>
            <div className="space-y-1.5">
              {completionData.estimated_1rms.map((e, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-700">{e.exercise}</span>
                  <span className="font-mono font-medium">{Math.round(e.estimated_1rm)} lbs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recovery prediction */}
        {completionData?.recovery && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Recovery Estimate</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800">{Math.round(completionData.recovery.hours_to_ready)}h to full recovery</p>
                <p className="text-xs text-blue-600 mt-0.5">Next hard session: {completionData.recovery.next_hard_date}</p>
              </div>
              <p className="text-xs text-blue-500 capitalize">{completionData.recovery.suggested_next}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => router.push('/fitness')}
          className="w-full rounded-xl bg-slate-800 text-white text-sm font-medium px-6 py-2.5 hover:bg-slate-700 min-h-[44px]"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ——— SCREEN: Cardio logging ———
  if (mode === 'cardio') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cardio Session</h2>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Activity</label>
                <select
                  value={cardioData.activity_type}
                  onChange={(e) => setCardioData((d) => ({ ...d, activity_type: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                >
                  {['run', 'walk', 'bike', 'treadmill', 'elliptical', 'swim'].map((a) => (
                    <option key={a} value={a} className="capitalize">{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                  placeholder="45"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Avg HR</label>
                <input type="number" value={cardioData.avg_hr ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, avg_hr: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="125" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Max HR</label>
                <input type="number" value={cardioData.max_hr ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, max_hr: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="148" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Distance (mi)</label>
                <input type="number" step="0.01" value={cardioData.distance_miles ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, distance_miles: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="3.1" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-2">Time in Zones (minutes)</label>
              <div className="grid grid-cols-4 gap-2">
                {(['zone1', 'zone2', 'zone3', 'zone4'] as const).map((z, i) => {
                  const key = `time_in_zone${i + 1}_min` as keyof CardioLog;
                  const colors = ['bg-blue-100', 'bg-green-100', 'bg-yellow-100', 'bg-red-100'];
                  return (
                    <div key={z}>
                      <label className={`text-xs font-medium block mb-1 px-2 py-0.5 rounded ${colors[i]}`}>Z{i + 1}</label>
                      <input
                        type="number"
                        step="0.5"
                        value={(cardioData[key] as number | undefined) ?? ''}
                        onChange={(e) => setCardioData((d) => ({ ...d, [key]: e.target.value ? Number(e.target.value) : undefined }))}
                        className="rounded-xl border border-slate-200 px-2 py-2 text-sm w-full text-center"
                        placeholder="0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Z2 Drift (min)</label>
                <input type="number" step="0.5" value={cardioData.z2_drift_duration_min ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, z2_drift_duration_min: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="8.5" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HR Rec 1min</label>
                <input type="number" value={cardioData.hr_recovery_1min ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, hr_recovery_1min: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="25" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HR Rec 2min</label>
                <input type="number" value={hrRecovery2min} onChange={(e) => setHrRecovery2min(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="40" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Session Notes</label>
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                rows={2}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
                placeholder="How did it feel? Weather? Route?"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Session RPE (1-10)</label>
              <div className="flex gap-1.5">
                {[...Array(10)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setRpeSession(i + 1)}
                    className={`h-9 w-9 rounded-lg text-xs font-medium ${rpeSession === i + 1 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={saveWorkout}
          disabled={saving}
          className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold py-3 hover:bg-green-800 min-h-[44px] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Complete Workout'}
        </button>
      </div>
    );
  }

  // ——— SCREEN: Strength logging ———
  const exercisesByGroup = sets.reduce<Record<string, LoggedSet[]>>((acc, s) => {
    const key = `${s.exercise_id}:${s.exercise_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Exercise selector */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
        <div className="flex gap-2">
          <select
            value={currentExerciseId}
            onChange={(e) => setCurrentExerciseId(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="">— Select exercise —</option>
            {(['push', 'pull', 'legs', 'core', 'cardio', 'mobility'] as const).map((cat) => {
              const catExercises = exercises.filter((e) => e.category === cat);
              if (catExercises.length === 0) return null;
              return (
                <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                  {catExercises.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <button
            onClick={addSet}
            disabled={!currentExerciseId}
            className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 disabled:opacity-40 min-h-[44px] min-w-[44px]"
          >
            + Set
          </button>
        </div>
      </div>

      {/* Logged sets by exercise */}
      {Object.entries(exercisesByGroup).map(([key, exerciseSets]) => {
        const [, name] = key.split(':');
        return (
          <div key={key} className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">{name}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {exerciseSets.map((s, localIdx) => {
                const globalIdx = sets.indexOf(s);
                return (
                  <div key={globalIdx} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-slate-400 w-6">#{s.set_number}</span>
                      <div className="flex gap-1">
                        {(Object.keys(SET_TYPE_LABELS) as SetType[]).map((t) => (
                          <button
                            key={t}
                            onClick={() => updateSet(globalIdx, 'set_type', t)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium min-h-[32px] ${
                              s.set_type === t ? SET_TYPE_COLORS[t] : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {SET_TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => removeSet(globalIdx)}
                        className="ml-auto text-slate-300 hover:text-red-400 text-lg leading-none min-h-[32px] min-w-[32px]"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-0.5">Weight (lbs)</label>
                        <input
                          type="number"
                          step="2.5"
                          value={s.weight_lbs}
                          onChange={(e) => updateSet(globalIdx, 'weight_lbs', e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-center font-medium"
                          placeholder="135"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-0.5">Reps</label>
                        <input
                          type="number"
                          value={s.reps}
                          onChange={(e) => updateSet(globalIdx, 'reps', e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-center font-medium"
                          placeholder="5"
                        />
                      </div>
                      <div className="w-16">
                        <label className="text-xs text-slate-400 block mb-0.5">RPE</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          step="0.5"
                          value={s.rpe}
                          onChange={(e) => updateSet(globalIdx, 'rpe', e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-center"
                          placeholder="7"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Rest timer */}
      <RestTimer defaultSeconds={90} />

      {/* Plate calculator toggle */}
      <button
        onClick={() => setShowPlateCalc((v) => !v)}
        className="w-full text-left rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-white/90"
      >
        {showPlateCalc ? '▼' : '▶'} Plate Calculator
      </button>
      {showPlateCalc && <PlateCalculator />}

      {/* Session wrap-up */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              placeholder="60"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Session RPE</label>
            <div className="flex gap-1">
              {[5,6,7,8,9,10].map((r) => (
                <button
                  key={r}
                  onClick={() => setRpeSession(r)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium min-h-[40px] ${rpeSession === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* HR from watch/strap — links strength workout to HR data */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Avg HR (bpm)</label>
            <input
              type="number"
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              placeholder="From watch"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Max HR (bpm)</label>
            <input
              type="number"
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              placeholder="From watch"
            />
          </div>
        </div>

        <textarea
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
          rows={2}
          placeholder="Session notes..."
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
        />
      </div>

      <button
        onClick={saveWorkout}
        disabled={saving || sets.length === 0}
        className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold py-3 hover:bg-green-800 min-h-[44px] disabled:opacity-50"
      >
        {saving ? 'Saving...' : `Complete Workout (${sets.length} sets)`}
      </button>

      <button
        onClick={() => router.back()}
        className="w-full rounded-xl border border-slate-200 text-slate-600 text-sm py-2.5 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}
