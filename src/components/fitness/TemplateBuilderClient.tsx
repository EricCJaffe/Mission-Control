'use client';

import { useState } from 'react';
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
import type { WorkoutStructureItem, StandaloneExercise, SupersetGroup, SetTarget, SetType } from '@/lib/fitness/types';

type Exercise = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  muscle_groups: string[];
  is_compound: boolean;
  is_template: boolean;
};

type Template = {
  id: string;
  name: string;
  type: string;
  structure: unknown;
};

type Props = {
  template: Template;
  exercises: Exercise[];
};

const SET_TYPES: SetType[] = ['warmup', 'working', 'cooldown', 'drop', 'failure', 'amrap'];

// Helper to generate unique IDs for structure items
let itemIdCounter = 0;
function generateItemId() {
  return `item_${++itemIdCounter}_${Date.now()}`;
}

// Sortable Item Component
function SortableStructureItem({
  item,
  index,
  onEdit,
  onDelete,
  onMakeSuperset,
  exercises,
}: {
  item: WorkoutStructureItem & { _id: string };
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onMakeSuperset: () => void;
  exercises: Exercise[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (item.type === 'superset') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-xl border-2 border-purple-300 bg-purple-50 p-4"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-purple-400 hover:text-purple-600"
            >
              ⋮⋮
            </button>
            <div>
              <h3 className="font-semibold text-purple-900">🔗 Superset {index + 1}</h3>
              <p className="text-xs text-purple-700">
                {item.rounds} rounds • {item.exercises.length} exercises
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit} className="text-xs text-purple-600 hover:text-purple-800">
              Edit
            </button>
            <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
              Delete
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {item.exercises.map((ex, i) => {
            const exercise = exercises.find(e => e.id === ex.exercise_id);
            return (
              <div key={i} className="flex items-center gap-2 text-sm bg-white/60 rounded-lg p-2">
                <span className="text-purple-600 font-mono">{String.fromCharCode(65 + i)}</span>
                <span className="font-medium">{exercise?.name || ex.exercise_id}</span>
                <span className="text-slate-500">
                  {ex.target_reps} reps{ex.target_weight ? ` @ ${ex.target_weight} lbs` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Standalone exercise
  const exercise = exercises.find(e => e.id === item.exercise_id);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
          >
            ⋮⋮
          </button>
          <div>
            <h3 className="font-semibold text-slate-900">{exercise?.name || item.exercise_id}</h3>
            <p className="text-xs text-slate-500">
              {item.sets.length} set{item.sets.length !== 1 ? 's' : ''}
              {exercise?.category && ` • ${exercise.category}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onMakeSuperset} className="text-xs text-purple-500 hover:text-purple-700">
            +Superset
          </button>
          <button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateBuilderClient({ template, exercises }: Props) {
  const router = useRouter();

  // Parse existing structure and add _id for drag-and-drop
  const initialStructure = Array.isArray(template.structure)
    ? (template.structure as WorkoutStructureItem[]).map(item => ({
        ...item,
        _id: generateItemId(),
      }))
    : [];

  const [structure, setStructure] = useState<(WorkoutStructureItem & { _id: string })[]>(initialStructure);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingSets, setEditingSets] = useState<SetTarget[]>([]);
  const [editingNotes, setEditingNotes] = useState('');
  const [editingSuperset, setEditingSuperset] = useState<SupersetGroup | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStructure((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function addExercise(exerciseId: string) {
    const newItem: StandaloneExercise & { _id: string } = {
      _id: generateItemId(),
      type: 'standalone',
      exercise_id: exerciseId,
      sets: [
        { type: 'working', target_reps: 10, target_weight: 0 },
        { type: 'working', target_reps: 10, target_weight: 0 },
        { type: 'working', target_reps: 10, target_weight: 0 },
      ],
      notes: '',
    };
    setStructure([...structure, newItem]);
    setShowExercisePicker(false);
    setExerciseSearch('');
  }

  function startEdit(index: number) {
    const item = structure[index];
    if (item.type === 'standalone') {
      setEditingSets([...item.sets]);
      setEditingNotes(item.notes || '');
      setEditingSuperset(null);
    } else {
      setEditingSuperset({ ...item });
      setEditingSets([]);
      setEditingNotes('');
    }
    setEditingIndex(index);
  }

  function saveEdit() {
    if (editingIndex === null) return;

    setStructure(prev => {
      const newStructure = [...prev];
      const item = newStructure[editingIndex];

      if (editingSuperset) {
        newStructure[editingIndex] = { ...editingSuperset, _id: item._id };
      } else if (item.type === 'standalone') {
        newStructure[editingIndex] = {
          ...item,
          sets: editingSets,
          notes: editingNotes,
        };
      }

      return newStructure;
    });

    setEditingIndex(null);
    setEditingSets([]);
    setEditingNotes('');
    setEditingSuperset(null);
  }

  function deleteItem(index: number) {
    setStructure(prev => prev.filter((_, i) => i !== index));
  }

  function makeSuperset(index: number) {
    const item = structure[index];
    if (item.type !== 'standalone') return;

    const newSuperset: SupersetGroup & { _id: string } = {
      _id: item._id,
      type: 'superset',
      group_name: 'Superset',
      rounds: 3,
      exercises: [
        {
          exercise_id: item.exercise_id,
          target_reps: item.sets[0]?.target_reps || 10,
          target_weight: item.sets[0]?.target_weight,
        },
      ],
      rest_between_exercises: 30,
      rest_between_rounds: 120,
    };

    setStructure(prev => {
      const newStructure = [...prev];
      newStructure[index] = newSuperset;
      return newStructure;
    });
  }

  async function saveTemplate() {
    setSaving(true);
    setError(null);

    try {
      // Remove _id before saving
      const cleanStructure = structure.map(({ _id, ...item }) => item);

      const response = await fetch('/api/fitness/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          structure: cleanStructure,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        router.push('/fitness/templates');
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  const filteredExercises = exercises.filter(ex =>
    ex.name.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
    ex.category.toLowerCase().includes(exerciseSearch.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/fitness/templates')}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to Templates
        </button>
        <div className="flex gap-3">
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Add Exercise Button */}
      {!showExercisePicker && (
        <button
          onClick={() => setShowExercisePicker(true)}
          className="w-full rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Exercise
        </button>
      )}

      {/* Exercise Picker */}
      {showExercisePicker && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-900">Add Exercise</h3>
            <button
              onClick={() => {
                setShowExercisePicker(false);
                setExerciseSearch('');
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Cancel
            </button>
          </div>
          <input
            type="text"
            value={exerciseSearch}
            onChange={(e) => setExerciseSearch(e.target.value)}
            placeholder="Search exercises..."
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredExercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => addExercise(ex.id)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="font-medium text-sm">{ex.name}</div>
                <div className="text-xs text-slate-500">
                  {ex.category} {ex.equipment && `• ${ex.equipment}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Structure List with Drag-and-Drop */}
      {structure.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={structure.map(item => item._id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {structure.map((item, index) => (
                <SortableStructureItem
                  key={item._id}
                  item={item}
                  index={index}
                  onEdit={() => startEdit(index)}
                  onDelete={() => deleteItem(index)}
                  onMakeSuperset={() => makeSuperset(index)}
                  exercises={exercises}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <p>No exercises yet. Add exercises above to build your template.</p>
        </div>
      )}

      {/* Edit Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {editingSuperset ? (
              // Edit Superset
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-purple-900">Edit Superset</h2>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Rounds
                    </label>
                    <input
                      type="number"
                      value={editingSuperset.rounds}
                      onChange={(e) => setEditingSuperset({
                        ...editingSuperset,
                        rounds: parseInt(e.target.value) || 1,
                      })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Rest Between Rounds (sec)
                    </label>
                    <input
                      type="number"
                      value={editingSuperset.rest_between_rounds}
                      onChange={(e) => setEditingSuperset({
                        ...editingSuperset,
                        rest_between_rounds: parseInt(e.target.value) || 0,
                      })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Exercises
                  </label>
                  {editingSuperset.exercises.map((ex, i) => {
                    const exercise = exercises.find(e => e.id === ex.exercise_id);
                    return (
                      <div key={i} className="mb-2 p-3 bg-purple-50 rounded-lg">
                        <div className="font-medium text-sm mb-2">{exercise?.name}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            value={ex.target_reps}
                            onChange={(e) => {
                              const newExercises = [...editingSuperset.exercises];
                              newExercises[i].target_reps = parseInt(e.target.value) || 0;
                              setEditingSuperset({ ...editingSuperset, exercises: newExercises });
                            }}
                            placeholder="Reps"
                            className="rounded px-2 py-1 text-sm border border-purple-200"
                          />
                          <input
                            type="number"
                            value={ex.target_weight || ''}
                            onChange={(e) => {
                              const newExercises = [...editingSuperset.exercises];
                              newExercises[i].target_weight = parseInt(e.target.value) || undefined;
                              setEditingSuperset({ ...editingSuperset, exercises: newExercises });
                            }}
                            placeholder="Weight (lbs)"
                            className="rounded px-2 py-1 text-sm border border-purple-200"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={saveEdit}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Edit Standalone Exercise
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Edit Exercise Sets</h2>

                <div className="space-y-2">
                  {editingSets.map((set, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <select
                        value={set.type}
                        onChange={(e) => {
                          const newSets = [...editingSets];
                          newSets[i].type = e.target.value as SetType;
                          setEditingSets(newSets);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      >
                        {SET_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={set.target_reps || ''}
                        onChange={(e) => {
                          const newSets = [...editingSets];
                          newSets[i].target_reps = parseInt(e.target.value) || 0;
                          setEditingSets(newSets);
                        }}
                        placeholder="Reps"
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        value={set.target_weight || ''}
                        onChange={(e) => {
                          const newSets = [...editingSets];
                          newSets[i].target_weight = parseInt(e.target.value) || undefined;
                          setEditingSets(newSets);
                        }}
                        placeholder="Weight"
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => setEditingSets(editingSets.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setEditingSets([...editingSets, { type: 'working', target_reps: 10 }])}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Set
                </button>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Exercise notes..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={saveEdit}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
