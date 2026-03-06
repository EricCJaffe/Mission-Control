'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import RestTimer from './RestTimer';
import PlateCalculator from './PlateCalculator';
import QuickExerciseCreator from './QuickExerciseCreator';
import AIWorkoutBuilder from './AIWorkoutBuilder';
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

type RepeatSet = {
  exercise_id: string | null;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  superset_group: string | null;
  notes: string | null;
  exercises: { name: string; category: string } | null;
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
  activeMeds: Array<{
    id: string;
    name: string;
    type: string;
    timing: string | null;
    known_interactions: string | null;
  }>;
  repeatData?: {
    workout_type: string;
    template_id: string | null;
    sets: RepeatSet[];
  } | null;
  templateId?: string | null;
};

// ——— Internal types ———

type LoggedSet = {
  set_type: SetType;
  reps: number | '';
  weight_lbs: number | '';
  rpe: number | '';
  rest_seconds: number | null;
  notes: string;
  completed: boolean;
};

type ExerciseBlock = {
  id: string; // unique key for React
  exercise_id: string;
  exercise_name: string;
  sets: LoggedSet[];
  notes: string;
  superset_group: string | null; // links blocks in the same superset
  exercise_rpe: number | ''; // Overall RPE for the exercise
};

type WorkoutMode = 'select' | 'logging' | 'cardio' | 'complete';
type LoggerMode = 'template' | 'ai' | 'manual';

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

// Sortable wrapper for exercise items (standalone or superset)
function SortableExerciseItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        {...attributes}
        {...listeners}
        className="absolute left-1 top-3 z-10 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 px-1"
        title="Drag to reorder"
      >
        ⋮⋮
      </button>
      {children}
    </div>
  );
}

export default function WorkoutLoggerClient({ exercises, templates, todayPlan, latestMetrics, activeMeds, repeatData, templateId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<WorkoutMode>('select');
  const [loggerMode, setLoggerMode] = useState<LoggerMode>('template');
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

  // Elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerStartRef = useRef<number | null>(null);

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Auto-load template from URL
  useEffect(() => {
    if (templateId && templates.length > 0) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setSelectedTemplate(template);
        setWorkoutType(template.type ?? 'strength');
      }
    }
  }, [templateId, templates]);

  // Auto-load planned workout (from calendar click)
  useEffect(() => {
    if (todayPlan && templates.length > 0) {
      loadPlan();
    }
  }, [todayPlan, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'logging' || mode === 'cardio') {
      if (!timerStartRef.current) timerStartRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - (timerStartRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  function formatElapsed(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getMedicationTimingGuidance() {
    if (!activeMeds || activeMeds.length === 0) {
      return null;
    }

    const hour = new Date().getHours();
    const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const dueNow = activeMeds.filter((m) => (m.timing || '').toLowerCase().includes(dayPart));
    const interactionWarnings = activeMeds
      .map((m) => ({ name: m.name, warning: m.known_interactions }))
      .filter((m) => m.warning && m.warning.length > 0)
      .slice(0, 2);

    return {
      dayPart,
      dueNow,
      interactionWarnings,
    };
  }

  function renderMedicationTimingCard() {
    const guidance = getMedicationTimingGuidance();
    if (!guidance) return null;

    const sectionLabel = guidance.dayPart[0].toUpperCase() + guidance.dayPart.slice(1);

    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-semibold text-indigo-900">{sectionLabel} Medication Timing Check</p>
        {guidance.dueNow.length > 0 ? (
          <p className="text-xs text-indigo-800 mt-1">
            Due around now: {guidance.dueNow.map((m) => m.name).join(', ')}.
          </p>
        ) : (
          <p className="text-xs text-indigo-800 mt-1">
            No medications explicitly scheduled for this part of day.
          </p>
        )}
        {guidance.interactionWarnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {guidance.interactionWarnings.map((item) => (
              <p key={item.name} className="text-xs text-amber-800">
                {item.name}: {item.warning}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Exercise picker state
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [swapTarget, setSwapTarget] = useState<string | null>(null); // blockId to swap
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [showQuickCreator, setShowQuickCreator] = useState(false);

  // Local exercises list that can be updated when new exercises are created
  const [localExercises, setLocalExercises] = useState(exercises);

  // Superset builder state
  const [showSupersetBuilder, setShowSupersetBuilder] = useState(false);
  const [supersetSelections, setSupersetSelections] = useState<string[]>([]);

  // AI workout builder state
  const [showAIBuilder, setShowAIBuilder] = useState(false);

  // Incomplete sets warning state
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [incompleteSetCount, setIncompleteSetCount] = useState(0);

  // Save as template state
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Exercise history tracking
  const [exerciseHistory, setExerciseHistory] = useState<Map<string, { date: string; summary: string }>>(new Map());

  const exerciseMap = new Map(localExercises.map((e) => [e.id, e]));

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
              completed: false,
            });
          }
          newBlocks.push({
            id: nextBlockId(),
            exercise_id: ssExercise.exercise_id,
            exercise_name: ex?.name || ssExercise.exercise_id,
            sets,
            notes: '',
            superset_group: groupId,
            exercise_rpe: '',
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
          completed: false,
        }));
        // If no sets defined, add 3 working sets as default
        if (sets.length === 0) {
          for (let i = 0; i < 3; i++) {
            sets.push({ set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '', completed: false });
          }
        }
        newBlocks.push({
          id: nextBlockId(),
          exercise_id: item.exercise_id,
          exercise_name: ex?.name || item.exercise_id,
          sets,
          notes: item.notes || '',
          superset_group: null,
          exercise_rpe: '',
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
            completed: true,
          });
        }
        newBlocks.push({
          id: nextBlockId(),
          exercise_id: pe.exercise_id,
          exercise_name: ex?.name || pe.exercise_id,
          sets,
          notes: '',
          superset_group: null,
          exercise_rpe: '',
        });
      }
      if (newBlocks.length > 0) setBlocks(newBlocks);
    }
  }

  // ——— Repeat previous workout ———
  function loadRepeat() {
    if (!repeatData || repeatData.sets.length === 0) return;

    // Group sets by exercise_id, preserving order
    const exerciseOrder: string[] = [];
    const setsByExercise = new Map<string, RepeatSet[]>();

    for (const s of repeatData.sets) {
      const key = s.exercise_id ?? 'unknown';
      if (!setsByExercise.has(key)) {
        exerciseOrder.push(key);
        setsByExercise.set(key, []);
      }
      setsByExercise.get(key)!.push(s);
    }

    const newBlocks: ExerciseBlock[] = [];
    for (const exId of exerciseOrder) {
      const exSets = setsByExercise.get(exId) ?? [];
      const firstSet = exSets[0];
      const ex = exId !== 'unknown' ? exerciseMap.get(exId) : null;
      const exName = ex?.name ?? firstSet?.exercises?.name ?? 'Unknown';

      const sets: LoggedSet[] = exSets.map(s => ({
        set_type: (s.set_type as SetType) || 'working',
        reps: s.reps ?? '',
        weight_lbs: s.weight_lbs ?? '',
        rpe: '',
        rest_seconds: null,
        notes: '',
        completed: true,
      }));

      newBlocks.push({
        id: nextBlockId(),
        exercise_id: exId,
        exercise_name: exName,
        sets,
        notes: '',
        superset_group: firstSet?.superset_group ?? null,
        exercise_rpe: '',
      });
    }

    setBlocks(newBlocks);
    setWorkoutType(repeatData.workout_type);
    if (repeatData.template_id) {
      const t = templates.find(t => t.id === repeatData.template_id);
      if (t) setSelectedTemplate(t);
    }
  }

  // ——— Block operations ———

  async function addExercise(exerciseId: string) {
    const ex = exerciseMap.get(exerciseId);
    if (!ex) return;

    // Fetch last workout data for this exercise
    let sets: LoggedSet[] = [
      { set_type: 'warmup', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '', completed: false },
      { set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '', completed: false },
      { set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '', completed: false },
    ];

    try {
      const res = await fetch(`/api/fitness/exercises/${exerciseId}/last-workout`);
      const data = await res.json();

      if (data.ok && data.has_history && data.sets.length > 0) {
        // Pre-fill with last workout data
        sets = data.sets.map((s: { set_type: SetType; reps: number | null; weight_lbs: number | null; rest_seconds: number | null }) => ({
          set_type: s.set_type,
          reps: s.reps ?? '',
          weight_lbs: s.weight_lbs ?? '',
          rpe: '',
          rest_seconds: s.rest_seconds,
          notes: '',
          completed: false,
        }));

        // Create summary string
        const firstWorkingSet = data.sets.find((s: { set_type: SetType }) => s.set_type === 'working') as
          | { reps: number | null; weight_lbs: number | null }
          | undefined;
        if (firstWorkingSet && data.workout_date) {
          const summary = `${data.sets.length}x${firstWorkingSet.reps || '?'} @ ${firstWorkingSet.weight_lbs || 0}lbs`;
          const date = new Date(data.workout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          setExerciseHistory(prev => new Map(prev).set(exerciseId, { date, summary }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch last workout:', error);
      // Continue with default sets
    }

    const newBlock: ExerciseBlock = {
      id: nextBlockId(),
      exercise_id: exerciseId,
      exercise_name: ex.name,
      sets,
      notes: '',
      superset_group: null,
      exercise_rpe: '',
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

  function handleAIGeneratedExercises(structure: WorkoutStructureItem[]) {
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
              completed: false,
            });
          }
          newBlocks.push({
            id: nextBlockId(),
            exercise_id: ssExercise.exercise_id,
            exercise_name: ex?.name || ssExercise.exercise_id,
            sets,
            notes: '',
            superset_group: groupId,
            exercise_rpe: '',
          });
        }
      } else {
        // Standalone exercise
        const ex = exerciseMap.get(item.exercise_id) ?? item.exercise;
        const sets: LoggedSet[] = item.sets.map((st) => ({
          set_type: st.type,
          reps: st.target_reps || '',
          weight_lbs: st.target_weight || '',
          rpe: '',
          rest_seconds: null,
          notes: '',
          completed: false,
        }));
        // If no sets defined, add 3 working sets as default
        if (sets.length === 0) {
          for (let i = 0; i < 3; i++) {
            sets.push({ set_type: 'working', reps: '', weight_lbs: '', rpe: '', rest_seconds: null, notes: '', completed: false });
          }
        }
        newBlocks.push({
          id: nextBlockId(),
          exercise_id: item.exercise_id,
          exercise_name: ex?.name || item.exercise_id,
          sets,
          notes: item.notes || '',
          superset_group: null,
          exercise_rpe: '',
        });
      }
    }

    // Append to existing blocks
    setBlocks(prev => [...prev, ...newBlocks]);
    setShowAIBuilder(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setBlocks((currentBlocks) => {
        // Build orderedItems to understand the current structure
        const items: Array<{ id: string; blockIds: string[] }> = [];
        const seenGroups = new Set<string>();

        for (const block of currentBlocks) {
          if (block.superset_group) {
            if (!seenGroups.has(block.superset_group)) {
              seenGroups.add(block.superset_group);
              items.push({
                id: block.superset_group,
                blockIds: currentBlocks.filter(b => b.superset_group === block.superset_group).map(b => b.id),
              });
            }
          } else {
            items.push({ id: block.id, blockIds: [block.id] });
          }
        }

        // Find old and new positions in items array
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);

        if (oldIndex < 0 || newIndex < 0) return currentBlocks;

        // Reorder items
        const reorderedItems = arrayMove(items, oldIndex, newIndex);

        // Flatten back to blocks
        const newBlocks: ExerciseBlock[] = [];
        for (const item of reorderedItems) {
          for (const blockId of item.blockIds) {
            const block = currentBlocks.find(b => b.id === blockId);
            if (block) newBlocks.push(block);
          }
        }

        return newBlocks;
      });
    }
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
          completed: false,
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

  const performSave = async () => {
    if (saving) return;
    setSaving(true);

    const payload = {
      planned_workout_id: todayPlan?.id ?? null,
      template_id: selectedTemplate?.id ?? null,
      workout_type: workoutType,
      duration_minutes: duration !== '' ? Number(duration) : (elapsedSeconds > 60 ? Math.round(elapsedSeconds / 60) : null),
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

  const saveWorkout = () => {
    // Count incomplete sets
    const incompleteSets = blocks.reduce((count, block) => {
      return count + block.sets.filter(s => !s.completed).length;
    }, 0);

    if (incompleteSets > 0) {
      setIncompleteSetCount(incompleteSets);
      setShowIncompleteWarning(true);
    } else {
      performSave();
    }
  };

  const handleSaveAnyway = () => {
    setShowIncompleteWarning(false);
    performSave();
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim() || savingTemplate) return;
    setSavingTemplate(true);

    // Convert exerciseBlocks to WorkoutStructureItem[]
    const structure: WorkoutStructureItem[] = [];
    const seenGroups = new Set<string>();

    for (const block of blocks) {
      if (block.superset_group) {
        if (!seenGroups.has(block.superset_group)) {
          seenGroups.add(block.superset_group);
          const supersetBlocks = blocks.filter(b => b.superset_group === block.superset_group);
          const rounds = Math.max(...supersetBlocks.map(b => b.sets.length));
          structure.push({
            type: 'superset',
            group_name: `Superset ${structure.length + 1}`,
            rounds,
            exercises: supersetBlocks.map(b => ({
              exercise_id: b.exercise_id,
              target_reps: b.sets[0]?.reps !== '' ? Number(b.sets[0].reps) : 10,
              target_weight: b.sets[0]?.weight_lbs !== '' ? Number(b.sets[0].weight_lbs) : 0,
            })),
            rest_between_exercises: 30,
            rest_between_rounds: 120,
          });
        }
      } else {
        structure.push({
          type: 'standalone',
          exercise_id: block.exercise_id,
          sets: block.sets.map(s => ({
            type: s.set_type,
            target_reps: s.reps !== '' ? Number(s.reps) : undefined,
            target_weight: s.weight_lbs !== '' ? Number(s.weight_lbs) : undefined,
          })),
          notes: block.notes || undefined,
        });
      }
    }

    try {
      const res = await fetch('/api/fitness/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          type: workoutType,
          structure,
          estimated_duration_min: duration !== '' ? Number(duration) : null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowSaveAsTemplate(false);
        setTemplateName('');
        alert('Template saved successfully!');
      } else {
        setError(data.error || 'Failed to save template');
      }
    } catch {
      setError('Network error — could not save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const totalSets = blocks.reduce((s, b) => s + b.sets.length, 0);

  // ——— Exercise picker (shared by add + swap) ———
  const filteredExercises = localExercises.filter(e => {
    if (!exerciseSearch) return true;
    const q = exerciseSearch.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
  });

  function handleExerciseCreated(exerciseId: string, exerciseName: string) {
    // Add the new exercise to local list
    const newExercise: ExerciseRow = {
      id: exerciseId,
      name: exerciseName,
      category: 'Other',
      equipment: null,
      muscle_groups: [],
      is_compound: false,
    };
    setLocalExercises([...localExercises, newExercise]);

    // Close the quick creator and add the exercise to the workout
    setShowQuickCreator(false);

    if (swapTarget) {
      swapExercise(swapTarget, exerciseId);
    } else {
      addExercise(exerciseId);
    }
  }

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

        {/* Create New Exercise button */}
        <button
          onClick={() => setShowQuickCreator(true)}
          className="w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-100 transition-colors min-h-[44px]"
        >
          + Create New Exercise
        </button>
      </div>
    );
  }

  // ——— SCREEN: Select mode ———
  if (mode === 'select') {
    return (
      <div className="space-y-4">
        {renderMedicationTimingCard()}

        {latestMetrics?.body_battery != null && latestMetrics.body_battery < 25 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">Low Body Battery ({latestMetrics.body_battery}/100)</p>
            <p className="text-xs text-orange-700 mt-0.5">Consider a recovery walk or rest day instead of intense training.</p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Start Workout</h2>

          {/* Mode Tabs */}
          <div className="mb-4">
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
              <button
                onClick={() => setLoggerMode('template')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                  loggerMode === 'template' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                From Template
              </button>
              <button
                onClick={() => setLoggerMode('ai')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                  loggerMode === 'ai' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                AI Builder
              </button>
              <button
                onClick={() => setLoggerMode('manual')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                  loggerMode === 'manual' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Manual
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-slate-500 block mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {(['strength', 'cardio', 'hiit', 'hybrid', 'mobility'] as const).map((t) => (
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

          {/* Template selector - only show in template mode */}
          {loggerMode === 'template' && templates.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-slate-500 block mb-2">Select Template</label>
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value) ?? null;
                  setSelectedTemplate(t);
                  if (t) setWorkoutType(t.type ?? workoutType);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              >
                <option value="">— Choose a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* AI Builder hint */}
          {loggerMode === 'ai' && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                AI Builder will help you create a workout based on your goals and recent training. Click &ldquo;Start Workout&rdquo; to begin.
              </p>
            </div>
          )}

          {/* Manual mode hint */}
          {loggerMode === 'manual' && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                Manual mode starts with a blank workout. Add exercises one by one as you go.
              </p>
            </div>
          )}

          {todayPlan && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700">Today&apos;s Plan: {todayPlan.day_label ?? todayPlan.workout_type}</p>
            </div>
          )}

          {repeatData && repeatData.sets.length > 0 && (
            <div className="mb-4 rounded-xl border border-green-100 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-700">
                Repeating previous {repeatData.workout_type} workout ({repeatData.sets.length} sets pre-filled)
              </p>
            </div>
          )}

          <button
            onClick={() => {
              if (workoutType === 'cardio' || workoutType === 'mobility') {
                setMode('cardio');
              } else if (loggerMode === 'ai') {
                // AI mode: Open AI builder directly
                setMode('logging');
                setShowAIBuilder(true);
              } else if (loggerMode === 'manual') {
                // Manual mode: Start with blank workout
                setBlocks([]);
                setMode('logging');
              } else {
                // Template mode: Pre-populate from repeat, template, or plan
                if (repeatData && repeatData.sets.length > 0) {
                  loadRepeat();
                } else if (selectedTemplate) {
                  loadTemplate(selectedTemplate);
                } else if (todayPlan) {
                  loadPlan();
                }
                setMode('logging');
              }
            }}
            disabled={loggerMode === 'template' && !selectedTemplate && !repeatData && !todayPlan}
            className="w-full rounded-xl bg-slate-800 text-white text-sm font-semibold py-3 hover:bg-slate-700 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {repeatData ? 'Repeat Workout' : loggerMode === 'ai' ? 'Build with AI' : 'Start Workout'}
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
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Workout Strain</p>
                <p className="text-2xl font-bold">{completionData.strain_score.toFixed(1)}</p>
                <p className="text-xs text-slate-400">/ 21</p>
              </div>
            )}
            {completionData.cardiac_efficiency && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Cardiac Efficiency</p>
                <p className="text-2xl font-bold">{completionData.cardiac_efficiency.efficiency_value.toFixed(3)}</p>
                <p className="text-xs text-slate-400">{completionData.cardiac_efficiency.efficiency_type}</p>
              </div>
            )}
          </div>
        )}

        {completionData?.estimated_1rms && completionData.estimated_1rms.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
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
    const isMobility = workoutType === 'mobility';
    const activityType = cardioData.activity_type || 'run';
    const isRunning = activityType === 'run' || activityType === 'walk' || activityType === 'treadmill';
    const isBiking = activityType === 'bike';

    // Auto-calculate pace for running (min/mile)
    const calculatedPace = (duration && cardioData.distance_miles && Number(duration) > 0 && Number(cardioData.distance_miles) > 0)
      ? (Number(duration) / Number(cardioData.distance_miles)).toFixed(2)
      : null;

    // Auto-calculate speed for biking (mph)
    const calculatedSpeed = (duration && cardioData.distance_miles && Number(duration) > 0 && Number(cardioData.distance_miles) > 0)
      ? ((Number(cardioData.distance_miles) / Number(duration)) * 60).toFixed(1)
      : null;

    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}
        {/* Elapsed timer */}
        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-slate-500">{isMobility ? 'Mobility' : 'Cardio'} in progress</span>
          </div>
          <span className="text-lg font-bold tabular-nums text-slate-800">{formatElapsed(elapsedSeconds)}</span>
        </div>

        {/* Mobility-specific simple form */}
        {isMobility ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Mobility Session</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Session Notes</label>
                <textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  rows={4}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
                  placeholder="What did you work on? (e.g., hip mobility, shoulder stretches, foam rolling)"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Session RPE (1-10)</label>
                <div className="flex gap-1.5">
                  {[...Array(10)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setRpeSession(i + 1)}
                      className={`h-9 w-9 rounded-lg text-xs font-medium ${
                        rpeSession === i + 1 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Cardio Session</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Activity</label>
                <select value={cardioData.activity_type} onChange={(e) => setCardioData((d) => ({ ...d, activity_type: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                  {['run', 'walk', 'bike', 'treadmill', 'elliptical', 'swim', 'row'].map((a) => (
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
                <label className="text-xs text-slate-500 block mb-1">Distance (mi)</label>
                <input type="number" step="0.01" value={cardioData.distance_miles ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, distance_miles: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" placeholder="3.1" />
              </div>
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
            </div>

            {/* Running-specific fields */}
            {isRunning && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700">Running Metrics</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Avg Pace (min/mi)</label>
                    <input
                      type="text"
                      value={cardioData.avg_pace_per_mile ?? (calculatedPace || '')}
                      onChange={(e) => setCardioData((d) => ({ ...d, avg_pace_per_mile: e.target.value || undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder={calculatedPace || '8:30'}
                    />
                    {calculatedPace && <p className="text-xs text-blue-600 mt-0.5">Auto: {calculatedPace}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Elevation Gain (ft)</label>
                    <input
                      type="number"
                      value={cardioData.elevation_gain_ft ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, elevation_gain_ft: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder="250"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Biking-specific fields */}
            {isBiking && (
              <div className="rounded-xl border border-green-100 bg-green-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-green-700">Cycling Metrics</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Avg Speed (mph)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cardioData.avg_speed_mph ?? (calculatedSpeed || '')}
                      onChange={(e) => setCardioData((d) => ({ ...d, avg_speed_mph: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder={calculatedSpeed || '18.5'}
                    />
                    {calculatedSpeed && <p className="text-xs text-green-600 mt-0.5">Auto: {calculatedSpeed} mph</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Elevation Gain (ft)</label>
                    <input
                      type="number"
                      value={cardioData.elevation_gain_ft ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, elevation_gain_ft: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder="500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Avg Power (W)</label>
                    <input
                      type="number"
                      value={cardioData.avg_power_watts ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, avg_power_watts: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder="180"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Norm Power (W)</label>
                    <input
                      type="number"
                      value={cardioData.normalized_power ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, normalized_power: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder="195"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">TSS</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cardioData.tss ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, tss: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
                      placeholder="65"
                    />
                  </div>
                </div>
              </div>
            )}
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
        )}

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
          <div className="flex flex-col items-center justify-end">
            <label className="text-[10px] text-slate-400 block mb-1">Done</label>
            <input
              type="checkbox"
              checked={s.completed}
              onChange={(e) => updateSetInBlock(block.id, setIdx, 'completed', e.target.checked)}
              className="h-7 w-7 rounded border-2 border-slate-300 text-green-600 focus:ring-2 focus:ring-green-500 cursor-pointer"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderExerciseBlock(block: ExerciseBlock, showReorder = true) {
    const blockIdx = blocks.findIndex(b => b.id === block.id);
    return (
      <div key={block.id} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {/* Exercise header */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
          <div className="flex-1">
            <button
              onClick={() => router.push(`/fitness/exercises/${block.exercise_id}`)}
              className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors text-left"
            >
              {block.exercise_name}
            </button>
            {exerciseHistory.has(block.exercise_id) && (
              <p className="text-xs text-blue-600 mt-0.5">
                Last: {exerciseHistory.get(block.exercise_id)?.summary} on {exerciseHistory.get(block.exercise_id)?.date}
              </p>
            )}
          </div>
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

        {/* Exercise-level RPE */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
          <label className="text-xs text-slate-500 block mb-1.5">Overall RPE for this exercise (1-10)</label>
          <div className="flex gap-1">
            {[...Array(10)].map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, exercise_rpe: i + 1 } : b))}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium min-h-[32px] ${
                  block.exercise_rpe === i + 1 ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
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
      {renderMedicationTimingCard()}

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Elapsed timer */}
      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-slate-500">Workout in progress</span>
        </div>
        <span className="text-lg font-bold tabular-nums text-slate-800">{formatElapsed(elapsedSeconds)}</span>
      </div>

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedItems.map(item => item.type === 'superset' ? item.groupId : item.block.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {orderedItems.map((item) => {
              const itemId = item.type === 'superset' ? item.groupId : item.block.id;

              if (item.type === 'superset') {
                return (
                  <SortableExerciseItem key={item.groupId} id={itemId}>
                    <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/30 p-2 space-y-2">
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Superset</span>
                        <button onClick={() => dissolveSuperset(item.groupId)}
                          className="text-[10px] text-purple-400 hover:text-purple-600">Ungroup</button>
                      </div>
                      {item.blocks.map(b => renderExerciseBlock(b, false))}
                    </div>
                  </SortableExerciseItem>
                );
              }

              return (
                <SortableExerciseItem key={item.block.id} id={itemId}>
                  {renderExerciseBlock(item.block)}
                </SortableExerciseItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={() => { setSwapTarget(null); setShowExercisePicker(true); }}
          className="flex-1 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 py-3 hover:border-slate-400 hover:text-slate-500 min-h-[44px]">
          + Add Exercise
        </button>
        <button onClick={() => setShowAIBuilder(true)}
          className="rounded-xl border border-dashed border-blue-300 text-sm text-blue-400 px-4 py-3 hover:border-blue-400 hover:text-blue-500 min-h-[44px] whitespace-nowrap">
          ✨ AI Builder
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
        className="w-full text-left rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-white/90">
        {showPlateCalc ? '▼' : '▶'} Plate Calculator
      </button>
      {showPlateCalc && <PlateCalculator />}

      {/* Session wrap-up */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
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

      <button
        onClick={() => setShowSaveAsTemplate(true)}
        disabled={blocks.length === 0}
        className="w-full rounded-xl border border-blue-600 text-blue-600 text-sm font-semibold py-3 hover:bg-blue-50 min-h-[44px] disabled:opacity-50"
      >
        Save as Template
      </button>

      <button onClick={saveWorkout} disabled={saving || totalSets === 0}
        className="w-full rounded-xl bg-green-700 text-white text-sm font-semibold py-3 hover:bg-green-800 min-h-[44px] disabled:opacity-50">
        {saving ? 'Saving...' : `Complete Workout (${blocks.length} exercises, ${totalSets} sets)`}
      </button>

      <button onClick={() => router.back()}
        className="w-full rounded-xl border border-slate-200 text-slate-600 text-sm py-2.5 hover:bg-slate-50">
        Cancel
      </button>

      {/* Quick exercise creator modal */}
      {showQuickCreator && (
        <QuickExerciseCreator
          onExerciseCreated={handleExerciseCreated}
          onCancel={() => setShowQuickCreator(false)}
        />
      )}

      {/* AI workout builder modal */}
      <AIWorkoutBuilder
        isOpen={showAIBuilder}
        onClose={() => setShowAIBuilder(false)}
        onAddExercises={handleAIGeneratedExercises}
        mode="logger"
      />

      {/* Save as Template modal */}
      {showSaveAsTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-100 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Save as Template</h3>
            <p className="text-sm text-slate-600 mb-4">
              Give this workout a name to save it as a reusable template.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Push Day A, Full Body Strength"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm mb-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSaveAsTemplate(false);
                  setTemplateName('');
                }}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incomplete sets warning modal */}
      {showIncompleteWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-100 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Incomplete Sets</h3>
            <p className="text-sm text-slate-600 mb-4">
              You have <strong>{incompleteSetCount}</strong> set{incompleteSetCount !== 1 ? 's' : ''} marked as incomplete.
              Do you want to review them or save the workout anyway?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowIncompleteWarning(false)}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Review Sets
              </button>
              <button
                onClick={handleSaveAnyway}
                className="flex-1 min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
