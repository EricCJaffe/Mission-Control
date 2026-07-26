'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
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

// Set-number badge styling by type. Working = the default green; other types
// recolor the badge so the type is readable at a glance. Tapping cycles type.
const SET_TYPE_BADGE: Record<SetType, string> = {
  working: 'border-lime-500 text-slate-800 bg-lime-50',
  warmup: 'border-amber-400 text-amber-700 bg-amber-50',
  cooldown: 'border-sky-400 text-sky-700 bg-sky-50',
  drop: 'border-purple-400 text-purple-700 bg-purple-50',
  failure: 'border-red-400 text-red-700 bg-red-50',
  amrap: 'border-orange-400 text-orange-700 bg-orange-50',
};
// Short glyph shown on the badge for non-working sets (working shows its number).
const SET_TYPE_GLYPH: Record<SetType, string> = {
  working: '', warmup: 'W', cooldown: 'C', drop: 'D', failure: 'F', amrap: 'A',
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

export default function WorkoutLoggerClient({ exercises, templates, todayPlan, latestMetrics, repeatData, templateId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<WorkoutMode>('select');
  const [loggerMode, setLoggerMode] = useState<LoggerMode>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [workoutType, setWorkoutType] = useState<string>('strength');
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
    // Building from the select screen drops you straight into logging the
    // generated workout. A no-op if you were already logging.
    setMode('logging');
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
  // Live tonnage = sum of weight × reps across every set. Blank inputs read 0.
  const tonnage = blocks.reduce(
    (sum, b) =>
      sum + b.sets.reduce((ss, set) => ss + (Number(set.weight_lbs) || 0) * (Number(set.reps) || 0), 0),
    0
  );
  const completedSets = blocks.reduce((s, b) => s + b.sets.filter((set) => set.completed).length, 0);

  // ——— Exercise picker (shared by add + swap) ———
  const filteredExercises = localExercises.filter(e => {
    if (!exerciseSearch) return true;
    const q = exerciseSearch.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
  });

  function handleExerciseCreated(exerciseId: string, exerciseName: string, category: string) {
    // Add the new exercise to local list, using the category the DB actually
    // stored so it groups correctly if the picker is reopened.
    const newExercise: ExerciseRow = {
      id: exerciseId,
      name: exerciseName,
      category: category || 'legs',
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
        {latestMetrics?.body_battery != null && latestMetrics.body_battery < 25 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">Low Body Battery ({latestMetrics.body_battery}/100)</p>
            <p className="text-xs text-orange-700 mt-0.5">Consider a recovery walk or rest day instead of intense training.</p>
          </div>
        )}

        <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
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
                onClick={() => { setLoggerMode('ai'); setShowAIBuilder(true); }}
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
            <select
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value)}
              className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full capitalize"
            >
              {['strength', 'cardio', 'hiit', 'hybrid', 'mobility'].map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
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
                className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
              >
                <option value="">— Choose a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* AI Builder hint — the builder opens as soon as you pick this tab */}
          {loggerMode === 'ai' && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                Describe a workout and AI builds it.{' '}
                <button onClick={() => setShowAIBuilder(true)} className="font-semibold underline">
                  Open builder
                </button>{' '}
                if it closed.
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
                // AI mode: (re)open the builder over the picker. Building it
                // transitions to logging; cancelling leaves you here.
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

        {/* AI builder opens over the picker; building it drops into logging. */}
        <AIWorkoutBuilder
          isOpen={showAIBuilder}
          onClose={() => setShowAIBuilder(false)}
          onAddExercises={handleAIGeneratedExercises}
          mode="logger"
        />
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
              <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Workout Strain</p>
                <p className="text-2xl font-bold">{completionData.strain_score.toFixed(1)}</p>
                <p className="text-xs text-slate-400">/ 21</p>
              </div>
            )}
            {completionData.cardiac_efficiency && (
              <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500">Cardiac Efficiency</p>
                <p className="text-2xl font-bold">{completionData.cardiac_efficiency.efficiency_value.toFixed(3)}</p>
                <p className="text-xs text-slate-400">{completionData.cardiac_efficiency.efficiency_type}</p>
              </div>
            )}
          </div>
        )}

        {completionData?.estimated_1rms && completionData.estimated_1rms.length > 0 && (
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
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

    // Live stats for the pinned header — mirrors the strength screen.
    const cardioStats: Array<{ label: string; value: string }> = isMobility
      ? [
          { label: 'Time', value: formatElapsed(elapsedSeconds) },
          { label: 'Minutes', value: duration !== '' ? String(duration) : '—' },
          { label: 'Effort', value: rpeSession !== '' ? String(rpeSession) : '—' },
        ]
      : [
          { label: 'Time', value: formatElapsed(elapsedSeconds) },
          { label: 'Distance (mi)', value: cardioData.distance_miles ? String(cardioData.distance_miles) : '—' },
          isBiking
            ? { label: 'Speed (mph)', value: String(cardioData.avg_speed_mph ?? calculatedSpeed ?? '—') }
            : { label: 'Pace (/mi)', value: String(cardioData.avg_pace_per_mile ?? calculatedPace ?? '—') },
        ];

    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}
        {/* Live stats — same pinned dark instrument panel as the strength screen. */}
        <div className="sticky top-2 z-20 rounded-2xl bg-slate-900 px-4 py-3 shadow-lg">
          <div className="grid grid-cols-3 gap-2 text-center">
            {cardioStats.map((stat) => (
              <div key={stat.label}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-lime-400">{stat.label}</div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobility-specific simple form */}
        {isMobility ? (
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Mobility Session</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Session effort (RPE 1–10)</label>
                <div className="flex gap-1">
                  {[...Array(10)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setRpeSession(i + 1)}
                      className={`min-h-[44px] flex-1 rounded-lg text-sm font-semibold tabular-nums ${
                        rpeSession === i + 1 ? 'bg-lime-500 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
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
          <div className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Cardio Session</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Activity</label>
                <select value={cardioData.activity_type} onChange={(e) => setCardioData((d) => ({ ...d, activity_type: e.target.value }))}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full">
                  {['run', 'walk', 'bike', 'treadmill', 'elliptical', 'swim', 'row'].map((a) => (
                    <option key={a} value={a} className="capitalize">{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
                <input type="number" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="45" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Distance (mi)</label>
                <input type="number" step="0.01" value={cardioData.distance_miles ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, distance_miles: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="3.1" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Avg HR</label>
                <input type="number" value={cardioData.avg_hr ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, avg_hr: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="125" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Max HR</label>
                <input type="number" value={cardioData.max_hr ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, max_hr: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="148" />
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
                      placeholder="180"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Norm Power (W)</label>
                    <input
                      type="number"
                      value={cardioData.normalized_power ?? ''}
                      onChange={(e) => setCardioData((d) => ({ ...d, normalized_power: e.target.value ? Number(e.target.value) : undefined }))}
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                      className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full"
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
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="8.5" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HR Rec 1min</label>
                <input type="number" value={cardioData.hr_recovery_1min ?? ''} onChange={(e) => setCardioData((d) => ({ ...d, hr_recovery_1min: e.target.value ? Number(e.target.value) : undefined }))}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="25" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HR Rec 2min</label>
                <input type="number" value={hrRecovery2min} onChange={(e) => setHrRecovery2min(e.target.value ? Number(e.target.value) : '')}
                  className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="40" />
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

  // One tappable row per set: [type/number badge] [lbs] [reps] [done] [remove].
  // Compact and thumb-sized for one-handed logging at the gym.
  function renderSetRow(block: ExerciseBlock, s: LoggedSet, setIdx: number) {
    const typeKeys = Object.keys(SET_TYPE_LABELS) as SetType[];
    const cycleType = () => {
      const next = typeKeys[(typeKeys.indexOf(s.set_type) + 1) % typeKeys.length];
      updateSetInBlock(block.id, setIdx, 'set_type', next);
    };
    return (
      <div
        key={setIdx}
        className={`grid grid-cols-[2.75rem_1fr_1fr_2.75rem_1.5rem] items-center gap-2 px-3 py-1.5 ${
          s.completed ? 'bg-lime-50/60' : ''
        }`}
      >
        {/* Set-number badge; tap to cycle set type. Colour encodes the type. */}
        <button
          onClick={cycleType}
          title={`${SET_TYPE_LABELS[s.set_type]} set — tap to change type`}
          className={`h-11 rounded-lg border-2 text-sm font-bold tabular-nums ${SET_TYPE_BADGE[s.set_type]}`}
        >
          {s.set_type === 'working' ? setIdx + 1 : SET_TYPE_GLYPH[s.set_type]}
        </button>
        <input
          type="number"
          inputMode="decimal"
          step="2.5"
          value={s.weight_lbs}
          onChange={(e) => updateSetInBlock(block.id, setIdx, 'weight_lbs', e.target.value ? Number(e.target.value) : '')}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-1 text-center text-base font-semibold tabular-nums focus:border-lime-500 focus:outline-none focus:ring-1 focus:ring-lime-500"
          placeholder="0"
        />
        <input
          type="number"
          inputMode="numeric"
          value={s.reps}
          onChange={(e) => updateSetInBlock(block.id, setIdx, 'reps', e.target.value ? Number(e.target.value) : '')}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-1 text-center text-base font-semibold tabular-nums focus:border-lime-500 focus:outline-none focus:ring-1 focus:ring-lime-500"
          placeholder="0"
        />
        <button
          onClick={() => updateSetInBlock(block.id, setIdx, 'completed', !s.completed)}
          aria-pressed={s.completed}
          title={s.completed ? 'Set done' : 'Mark set done'}
          className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-colors ${
            s.completed
              ? 'border-lime-500 bg-lime-500 text-white'
              : 'border-slate-200 bg-white text-slate-300 hover:border-lime-400'
          }`}
        >
          <Check className="h-5 w-5" strokeWidth={3} />
        </button>
        <button
          onClick={() => removeSetFromBlock(block.id, setIdx)}
          title="Remove set"
          className="flex h-11 w-6 items-center justify-center text-slate-300 hover:text-red-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderExerciseBlock(block: ExerciseBlock, showReorder = true) {
    const blockIdx = blocks.findIndex(b => b.id === block.id);
    return (
      <div key={block.id} className="rounded-2xl border-2 border-slate-300 bg-white shadow-sm overflow-hidden">
        {/* Exercise header */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
          <div className="flex-1">
            <button
              onClick={() => router.push(`/fitness/exercises/${block.exercise_id}`)}
              className="text-base font-bold text-slate-900 hover:text-lime-700 transition-colors text-left"
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

        {/* Column headers — labelled once, so each set row stays compact */}
        {block.sets.length > 0 && (
          <div className="grid grid-cols-[2.75rem_1fr_1fr_2.75rem_1.5rem] items-center gap-2 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="text-center">Set</span>
            <span className="text-center">Lbs</span>
            <span className="text-center">Reps</span>
            <span className="text-center">Done</span>
            <span />
          </div>
        )}

        {/* Sets */}
        <div className="divide-y divide-slate-100">
          {block.sets.map((s, setIdx) => renderSetRow(block, s, setIdx))}
        </div>

        {/* Exercise-level RPE */}
        <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50/50">
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Effort (RPE 1–10)
          </label>
          <div className="flex gap-1">
            {[...Array(10)].map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, exercise_rpe: i + 1 } : b))}
                className={`min-h-[36px] flex-1 rounded-md text-xs font-semibold tabular-nums ${
                  block.exercise_rpe === i + 1 ? 'bg-lime-500 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Add set */}
        <div className="px-3 py-2 border-t border-slate-100">
          <button
            onClick={() => addSetToBlock(block.id)}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-lime-50 text-sm font-semibold text-lime-700 hover:bg-lime-100"
          >
            + Add Set
          </button>
          <input
            type="text"
            value={block.notes}
            onChange={e => updateBlockNotes(block.id, e.target.value)}
            placeholder="Add notes for this exercise…"
            className="mt-2 w-full border-none bg-transparent px-1 text-xs text-slate-500 placeholder:text-slate-300 focus:outline-none"
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

      {/* Live stats — a dark "instrument panel" that stays pinned while you
          scroll and log. The one bold element on an otherwise light screen. */}
      <div className="sticky top-2 z-20 rounded-2xl bg-slate-900 px-4 py-3 shadow-lg">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Time', value: formatElapsed(elapsedSeconds) },
            { label: 'Tonnage (lbs)', value: tonnage.toLocaleString() },
            { label: 'Sets', value: completedSets === totalSets ? `${totalSets}` : `${completedSets}/${totalSets}` },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-lime-400">{stat.label}</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-white">{stat.value}</div>
            </div>
          ))}
        </div>
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
        className="w-full text-left rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-white/90">
        {showPlateCalc ? '▼' : '▶'} Plate Calculator
      </button>
      {showPlateCalc && <PlateCalculator />}

      {/* Session wrap-up */}
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration (min)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="60" />
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
              className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="From watch" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Max HR (bpm)</label>
            <input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-slate-200 min-h-[44px] px-3 text-base w-full" placeholder="From watch" />
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
          <div className="max-w-md w-full rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-lg">
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
          <div className="max-w-md w-full rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-lg">
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
