'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RestTimer from './RestTimer';
import PlateCalculator from './PlateCalculator';
import type { SetType, CardioLog, WorkoutStructureItem } from '@/lib/fitness/types';

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

// ——— Internal types ———

type LoggedSet = {
  set_type: SetType;
  reps: number | '';
  weight_lbs: number | '';
  rpe: number | '';
  rest_seconds: number | null;
  notes: string;
};

type ExerciseBlock = {
  id: string; // unique key for React
  exercise_id: string;
  exercise_name: string;
  sets: LoggedSet[];
  notes: string;
  superset_group: string | null; // links blocks in the same superset
};

type WorkoutMode = 'select' | 'logging' | 'cardio' | 'complete';

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Warm', working: 'Work', cooldown: 'Cool', drop: 'Drop', failure: 'Fail', amrap: 'AMRAP',
};

const SET_TYPE_COLORS: Record<SetType, string> = {
  warmup: 'bg-blue-100 text-blue-700',
  working: 'bg-slate-800 text-white',
  cooldown: 'bg-green-100 text-green-700',
  drop: 'bg-purple-100 text-purple-700',
  failure: 'bg-red-100 text-red-700',
  amrap: 'bg-orange-100 text-orange-700',
};

let blockIdCounter = 0;
function nextBlockId() { return `block_${++blockIdCounter}_${Date.now()}`; }

export default function WorkoutLoggerClient({ exercises, templates, todayPlan, latestMetrics }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<WorkoutMode>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [workoutType, setWorkoutType] = useState<string>(todayPlan?.workout_type ?? 'strength');
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [duration, setDuration] = useState<number | ''>('');
  const [rpeSession, setRpeSession] = useState<number | ''>('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [cardioData, setCardioData] = useState<Partial<CardioLog>>({ activity_type: 'run' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Exercise picker state
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [swapTarget, setSwapTarget] = useState<string | null>(null); // blockId to swap
  const [exerciseSearch, setExerciseSearch] = useState('');

  // Superset builder state
  const [showSupersetBuilder, setShowSupersetBuilder] = useState(false);
  const [supersetSelections, setSupersetSelections] = useState<string[]>([]);

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  // ——— Template pre-fill ———
  function loadTemplate(template: TemplateRow) {
    const structure = Array.isArray(template.structure) ? template.structure as WorkoutStructureItem[] : [];
    if (structure.length === 0) return;

    const newBlocks: ExerciseBlock[] = [];

    for (const item of structure) {
      if (item.type === 'superset') {
        const groupId = `ss_${nextBlockId()}`;
        for (const ssExercise of item.exercises) {
          const ex = exerciseMap.get(ssExercise.exercise_id);
          const sets: LoggedSet[] = [];
          for (let r = 0; r < item.rounds; r++) {
            sets.push({
              set_type: 'working',
              reps: ssExercise.target_reps || '',
              weight_lbs: ssExercise.target_weight || '',
              rpe: '',
              rest_seconds: r < item.rounds - 1 ? item.rest_between_exercises : null,
              notes: '',
            });
          }
          newBlocks.push({
            id: nextBlockId(),
            exercise_id: ssExercise.exercise_id,
            exercise_name: ex?.name || ssExercise.exercise_id,
            sets,
            notes: '',
            superset_group: groupId,
          });
        }
      } else {
        // Standalone exercise
        const ex = exerciseMap.get(item.exercise_id);
        const sets: LoggedSet[] = item.sets.map((st) => ({
          set_type: st.type,
          reps: st.target_reps || '',
          weight_lbs: st.target_weight || '',
          rpe: '',
          rest_seconds: null,
          notes: '',
        }));
        // If no sets defined, add 3 working sets as default
        if (sets.length === 0) {
          for (let i = 0; i < 3; i++) {
            sets.push({ set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '' });
          }
        }
        newBlocks.push({
          id: nextBlockId(),
          exercise_id: item.exercise_id,
          exercise_name: ex?.name || item.exercise_id,
          sets,
          notes: item.notes || '',
          superset_group: null,
        });
      }
    }

    setBlocks(newBlocks);
  }

  function loadPlan() {
    // If the plan links to a template, load that template
    if (todayPlan?.template_id) {
      const t = templates.find(t => t.id === todayPlan.template_id);
      if (t) {
        setSelectedTemplate(t);
        loadTemplate(t);
        return;
      }
    }
    // Otherwise try to use prescribed data
    const prescribed = todayPlan?.prescribed;
    if (prescribed && typeof prescribed === 'object' && Array.isArray((prescribed as { exercises?: unknown[] }).exercises)) {
      const exList = (prescribed as { exercises: Array<{ exercise_id: string; sets?: number; reps?: number; weight?: number }> }).exercises;
      const newBlocks: ExerciseBlock[] = [];
      for (const pe of exList) {
        const ex = exerciseMap.get(pe.exercise_id);
        const numSets = pe.sets || 3;
        const sets: LoggedSet[] = [];
        for (let i = 0; i < numSets; i++) {
          sets.push({
            set_type: i === 0 ? 'warmup' : 'working',
            reps: pe.reps || '',
            weight_lbs: pe.weight || '',
            rpe: '',
            rest_seconds: null,
            notes: '',
          });
        }
        newBlocks.push({
          id: nextBlockId(),
          exercise_id: pe.exercise_id,
          exercise_name: ex?.name || pe.exercise_id,
          sets,
          notes: '',
          superset_group: null,
        });
      }
      if (newBlocks.length > 0) setBlocks(newBlocks);
    }
  }

  // ——— Block operations ———

  function addExercise(exerciseId: string) {
    const ex = exerciseMap.get(exerciseId);
    if (!ex) return;
    const newBlock: ExerciseBlock = {
      id: nextBlockId(),
      exercise_id: exerciseId,
      exercise_name: ex.name,
      sets: [
        { set_type: 'warmup', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '' },
        { set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '' },
        { set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '' },
      ],
      notes: '',
      superset_group: null,
    };
    setBlocks(prev => [...prev, newBlock]);
    setShowExercisePicker(false);
    setExerciseSearch('');
  }

  function swapExercise(blockId: string, newExerciseId: string) {
    const ex = exerciseMap.get(newExerciseId);
    if (!ex) return;
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, exercise_id: newExerciseId, exercise_name: ex.name } : b
    ));
    setSwapTarget(null);
    setShowExercisePicker(false);
    setExerciseSearch('');
  }

  function removeBlock(blockId: string) {
    setBlocks(prev => {
      const block = prev.find(b => b.id === blockId);
      if (block?.superset_group) {
        // Check if removing leaves only 1 exercise in superset — dissolve the group
        const remaining = prev.filter(b => b.id !== blockId && b.superset_group === block.superset_group);
        if (remaining.length <= 1) {
          return prev.filter(b => b.id !== blockId).map(b =>
            b.superset_group === block.superset_group ? { ...b, superset_group: null } : b
          );
        }
      }
      return prev.filter(b => b.id !== blockId);
    });
  }

  function moveBlock(blockId: string, direction: 'up' | 'down') {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  function addSetToBlock(blockId: string) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const lastSet = b.sets[b.sets.length - 1];
      return {
        ...b,
        sets: [...b.sets, {
          set_type: 'working',
          reps: lastSet?.reps ?? '',
          weight_lbs: lastSet?.weight_lbs ?? '',
          rpe: '',
          rest_seconds: null,
          notes: '',
        }],
      };
    }));
  }

  function removeSetFromBlock(blockId: string, setIdx: number) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, sets: b.sets.filter((_, i) => i !== setIdx) };
    }));
  }

  function updateSetInBlock(blockId: string, setIdx: number, field: keyof LoggedSet, value: unknown) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, sets: b.sets.map((s, i) => i === setIdx ? { ...s, [field]: value } : s) };
    }));
  }

  function updateBlockNotes(blockId: string, notes: string) {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, notes } : b));
  }

  // ——— Superset operations ———

  function createSuperset() {
    if (supersetSelections.length < 2) return;
    const groupId = `ss_${nextBlockId()}`;
    setBlocks(prev => prev.map(b =>
      supersetSelections.includes(b.id) ? { ...b, superset_group: groupId } : b
    ));
    setSupersetSelections([]);
    setShowSupersetBuilder(false);
  }

  function dissolveSuperset(groupId: string) {
    setBlocks(prev => prev.map(b =>
      b.superset_group === groupId ? { ...b, superset_group: null } : b
    ));
  }

  // ——— Flatten blocks back into sets for saving ———
  function flattenBlocksToSets() {
    const allSets: Array<{
      exercise_id: string | null;
      set_number: number;
      set_type: SetType;
      reps: number | null;
      weight_lbs: number | null;
      rpe: number | null;
      rest_seconds: number | null;
      superset_group: string | null;
      superset_round: number | null;
      is_pr: boolean;
      notes: string | null;
    }> = [];

    for (const block of blocks) {
      block.sets.forEach((s, i) => {
        allSets.push({
          exercise_id: block.exercise_id || null,
          set_number: i + 1,
          set_type: s.set_type,
          reps: s.reps !== '' ? Number(s.reps) : null,
          weight_lbs: s.weight_lbs !== '' ? Number(s.weight_lbs) : null,
          rpe: s.rpe !== '' ? Number(s.rpe) : null,
          rest_seconds: s.rest_seconds,
          superset_group: block.superset_group,
          superset_round: block.superset_group ? i + 1 : null,
          is_pr: false,
          notes: s.notes || null,
        });
      });
    }
    return allSets;
  }

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
      sets: flattenBlocksToSets(),
      cardio: (workoutType === 'cardio' || workoutType === 'hybrid')
        ? { ...cardioData, hr_recovery_2min: hrRecovery2min !== '' ? Number(hrRecovery2min) : undefined }
        : null,
    };

    setError(null);
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
      } else {
        setError(data.error || 'Failed to save workout');
      }
    } catch {
      setError('Network error — could not save workout');
    } finally {
      setSaving(false);
    }
  };

  const totalSets = blocks.reduce((s, b) => s + b.sets.length, 0);

  // ——— Exercise picker (shared by add + swap) ———
  const filteredExercises = exercises.filter(e => {
    if (!exerciseSearch) return true;
    const q = exerciseSearch.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
  });

  function renderExercisePicker() {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            {swapTarget ? 'Swap Exercise' : 'Add Exercise'}
          </h3>
          <button onClick={() => { setShowExercisePicker(false); setSwapTarget(null); setExerciseSearch(''); }}
            className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
        <input
          type="text"
          value={exerciseSearch}
          onChange={e => setExerciseSearch(e.target.value)}
          placeholder="Search exercises..."
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(['push', 'pull', 'legs', 'core', 'cardio', 'mobility'] as const).map(cat => {
            const catExercises = filteredExercises.filter(e => e.category === cat);
            if (catExercises.length === 0) return null;
            return (
              <div key={cat}>
                <div className="px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0">
                  {cat}
                </div>
                {catExercises.map(e => (
                  <button
                    key={e.id}
                    onClick={() => swapTarget ? swapExercise(swapTarget, e.id) : addExercise(e.id)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-2 min-h-[40px]"
                  >
                    <span className="flex-1">{e.name}</span>
                    {e.equipment && <span className="text-xs text-slate-400">{e.equipment}</span>}
                    {e.is_compound && <span className="text-xs text-blue-500">C</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {filteredExercises.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">No exercises match your search.</p>
          )}
        </div>
      </div>
    );
  }

  // ——— SCREEN: Select mode ———
  if (mode === 'select') {
    return (
      <div className="space-y-4">
        {latestMetrics?.body_battery != null && latestMetrics.body_battery < 25 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">Low Body Battery ({latestMetrics.body_battery}/100)</p>
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
              <p className="text-xs font-medium text-blue-700">Today&apos;s Plan: {todayPlan.day_label ?? todayPlan.workout_type}</p>
            </div>
          )}

          <button
            onClick={() => {
              if (workoutType === 'cardio') {
                setMode('cardio');
              } else {
                // Pre-populate from template or plan
                if (selectedTemplate) {
                  loadTemplate(selectedTemplate);
                } else if (todayPlan) {
                  loadPlan();
                }
                setMode('logging');
              }
            }}
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
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cardio Session</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Activity</label>
                <select value={cardioData.activity_type} onChange={(e) => setCardioData((d) => ({ ...d, activity_type: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                  {['run', 'walk', 'bike', 'treadmill', 'elliptical', 'swim'].map((a) => (
                    <option key={a} value={a} className="capitalize">{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
                <input type="number" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="45" />
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
                      <input type="number" step="0.5" value={(cardioData[key] as number | undefined) ?? ''}
                        onChange={(e) => setCardioData((d) => ({ ...d, [key]: e.target.value ? Number(e.target.value) : undefined }))}
                        className="rounded-xl border border-slate-200 px-2 py-2 text-sm w-full text-center" placeholder="0" />
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
              <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} rows={2}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" placeholder="How did it feel? Weather? Route?" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Session RPE (1-10)</label>
              <div className="flex gap-1.5">
                {[...Array(10)].map((_, i) => (
                  <button key={i + 1} onClick={() => setRpeSession(i + 1)}
                    className={`h-9 w-9 rounded-lg text-xs font-medium ${rpeSession === i + 1 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <button onClick={saveWorkout} disabled={saving}
          className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold py-3 hover:bg-green-800 min-h-[44px] disabled:opacity-50">
          {saving ? 'Saving...' : 'Complete Workout'}
        </button>
      </div>
    );
  }

  // ——— SCREEN: Strength logging ———

  // Group blocks by superset for rendering
  const orderedItems: Array<{ type: 'standalone'; block: ExerciseBlock } | { type: 'superset'; groupId: string; blocks: ExerciseBlock[] }> = [];
  const seenGroups = new Set<string>();

  for (const block of blocks) {
    if (block.superset_group) {
      if (!seenGroups.has(block.superset_group)) {
        seenGroups.add(block.superset_group);
        orderedItems.push({
          type: 'superset',
          groupId: block.superset_group,
          blocks: blocks.filter(b => b.superset_group === block.superset_group),
        });
      }
    } else {
      orderedItems.push({ type: 'standalone', block });
    }
  }

  function renderSetRow(block: ExerciseBlock, s: LoggedSet, setIdx: number) {
    return (
      <div key={setIdx} className="px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs text-slate-400 w-5 text-center">#{setIdx + 1}</span>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(SET_TYPE_LABELS) as SetType[]).map((t) => (
              <button key={t} onClick={() => updateSetInBlock(block.id, setIdx, 'set_type', t)}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium min-h-[24px] ${
                  s.set_type === t ? SET_TYPE_COLORS[t] : 'bg-slate-100 text-slate-400'
                }`}>
                {SET_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <button onClick={() => removeSetFromBlock(block.id, setIdx)}
            className="ml-auto text-slate-300 hover:text-red-400 text-sm leading-none min-h-[24px] min-w-[24px]">
            ×
          </button>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-slate-400 block mb-0.5">Weight</label>
            <input type="number" step="2.5" value={s.weight_lbs}
              onChange={(e) => updateSetInBlock(block.id, setIdx, 'weight_lbs', e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-center font-medium" placeholder="lbs" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-slate-400 block mb-0.5">Reps</label>
            <input type="number" value={s.reps}
              onChange={(e) => updateSetInBlock(block.id, setIdx, 'reps', e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-center font-medium" placeholder="reps" />
          </div>
          <div className="w-14">
            <label className="text-[10px] text-slate-400 block mb-0.5">RPE</label>
            <input type="number" min={1} max={10} step={0.5} value={s.rpe}
              onChange={(e) => updateSetInBlock(block.id, setIdx, 'rpe', e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-center" placeholder="—" />
          </div>
        </div>
      </div>
    );
  }

  function renderExerciseBlock(block: ExerciseBlock, showReorder = true) {
    const blockIdx = blocks.findIndex(b => b.id === block.id);
    return (
      <div key={block.id} className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
        {/* Exercise header */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 flex-1">{block.exercise_name}</p>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setSwapTarget(block.id); setShowExercisePicker(true); }}
              className="text-[10px] text-slate-400 hover:text-blue-500 px-1.5 py-1 rounded min-h-[28px]" title="Swap exercise">
              Swap
            </button>
            {showReorder && (
              <>
                <button onClick={() => moveBlock(block.id, 'up')} disabled={blockIdx === 0}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs px-1 min-h-[28px]" title="Move up">
                  ↑
                </button>
                <button onClick={() => moveBlock(block.id, 'down')} disabled={blockIdx === blocks.length - 1}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs px-1 min-h-[28px]" title="Move down">
                  ↓
                </button>
              </>
            )}
            <button onClick={() => removeBlock(block.id)}
              className="text-slate-300 hover:text-red-400 text-sm px-1 min-h-[28px]" title="Remove exercise">
              ×
            </button>
          </div>
        </div>

        {/* Sets */}
        <div className="divide-y divide-slate-100">
          {block.sets.map((s, setIdx) => renderSetRow(block, s, setIdx))}
        </div>

        {/* Add set + notes */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2">
          <button onClick={() => addSetToBlock(block.id)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium min-h-[32px]">
            + Add Set
          </button>
          <div className="flex-1" />
          <input
            type="text"
            value={block.notes}
            onChange={e => updateBlockNotes(block.id, e.target.value)}
            placeholder="Exercise notes..."
            className="text-xs border-none bg-transparent text-slate-400 placeholder:text-slate-300 text-right w-40 focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Exercise picker overlay */}
      {showExercisePicker && renderExercisePicker()}

      {/* Superset builder */}
      {showSupersetBuilder && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Create Superset</h3>
            <button onClick={() => { setShowSupersetBuilder(false); setSupersetSelections([]); }}
              className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
          <p className="text-xs text-slate-500">Select 2-3 exercises to group as a superset:</p>
          <div className="space-y-1">
            {blocks.filter(b => !b.superset_group).map(b => (
              <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-purple-100">
                <input type="checkbox" checked={supersetSelections.includes(b.id)}
                  onChange={e => {
                    if (e.target.checked) setSupersetSelections(prev => [...prev, b.id]);
                    else setSupersetSelections(prev => prev.filter(id => id !== b.id));
                  }}
                  className="rounded border-slate-300" />
                {b.exercise_name}
              </label>
            ))}
          </div>
          <button onClick={createSuperset} disabled={supersetSelections.length < 2}
            className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-40 min-h-[32px]">
            Group as Superset ({supersetSelections.length} selected)
          </button>
        </div>
      )}

      {/* Exercise blocks */}
      {orderedItems.map((item) => {
        if (item.type === 'superset') {
          return (
            <div key={item.groupId} className="rounded-2xl border-2 border-purple-200 bg-purple-50/30 p-2 space-y-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Superset</span>
                <button onClick={() => dissolveSuperset(item.groupId)}
                  className="text-[10px] text-purple-400 hover:text-purple-600">Ungroup</button>
              </div>
              {item.blocks.map(b => renderExerciseBlock(b, false))}
            </div>
          );
        }
        return renderExerciseBlock(item.block);
      })}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={() => { setSwapTarget(null); setShowExercisePicker(true); }}
          className="flex-1 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 py-3 hover:border-slate-400 hover:text-slate-500 min-h-[44px]">
          + Add Exercise
        </button>
        {blocks.filter(b => !b.superset_group).length >= 2 && (
          <button onClick={() => setShowSupersetBuilder(true)}
            className="rounded-xl border border-dashed border-purple-300 text-sm text-purple-400 px-4 py-3 hover:border-purple-400 hover:text-purple-500 min-h-[44px]">
            Superset
          </button>
        )}
      </div>

      {/* Rest timer */}
      <RestTimer defaultSeconds={90} />

      {/* Plate calculator toggle */}
      <button onClick={() => setShowPlateCalc((v) => !v)}
        className="w-full text-left rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-white/90">
        {showPlateCalc ? '▼' : '▶'} Plate Calculator
      </button>
      {showPlateCalc && <PlateCalculator />}

      {/* Session wrap-up */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="60" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Session RPE</label>
            <div className="flex gap-1">
              {[5, 6, 7, 8, 9, 10].map((r) => (
                <button key={r} onClick={() => setRpeSession(r)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium min-h-[40px] ${rpeSession === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Avg HR (bpm)</label>
            <input type="number" value={avgHr} onChange={(e) => setAvgHr(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="From watch" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Max HR (bpm)</label>
            <input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="From watch" />
          </div>
        </div>
        <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} rows={2}
          placeholder="Session notes..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
      </div>

      <button onClick={saveWorkout} disabled={saving || totalSets === 0}
        className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold py-3 hover:bg-green-800 min-h-[44px] disabled:opacity-50">
        {saving ? 'Saving...' : `Complete Workout (${blocks.length} exercises, ${totalSets} sets)`}
      </button>

      <button onClick={() => router.back()}
        className="w-full rounded-xl border border-slate-200 text-slate-600 text-sm py-2.5 hover:bg-slate-50">
        Cancel
      </button>
    </div>
  );
}
