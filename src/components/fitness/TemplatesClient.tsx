'use client';

import { useState } from 'react';
import type { WorkoutType } from '@/lib/fitness/types';

type TemplateRow = {
  id: string;
  name: string;
  type: WorkoutType;
  split_type: string | null;
  estimated_duration_min: number | null;
  ai_generated: boolean;
  structure: unknown[];
  notes: string | null;
  created_at: string;
};

const TYPE_ICONS: Record<string, string> = { strength: '🏋️', cardio: '🏃', hiit: '⚡', hybrid: '🔥' };
const TYPES: WorkoutType[] = ['strength', 'cardio', 'hiit', 'hybrid'];

export default function TemplatesClient({ templates: initial }: { templates: TemplateRow[] }) {
  const [templates, setTemplates] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkoutType>('strength');
  const [splitType, setSplitType] = useState('');
  const [notes, setNotes] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<WorkoutType>('strength');
  const [editSplit, setEditSplit] = useState('');
  const [editNotes, setEditNotes] = useState('');

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, split_type: splitType || null, notes: notes || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setTemplates(prev => [...prev, data.template]);
        setName(''); setSplitType(''); setNotes('');
        setShowAdd(false);
      }
    } catch { setError('Network error — could not save'); }
    setSaving(false);
  }

  function startEdit(t: TemplateRow) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditType(t.type);
    setEditSplit(t.split_type || '');
    setEditNotes(t.notes || '');
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName, type: editType, split_type: editSplit || null, notes: editNotes || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setTemplates(prev => prev.map(t => t.id === editingId ? data.template : t));
        setEditingId(null);
      }
    } catch { setError('Network error — could not update'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/fitness/templates?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        setConfirmDeleteId(null);
      }
    } catch { setError('Network error — could not delete'); }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Add form */}
      {showAdd ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Create Template</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <select value={type} onChange={e => setType(e.target.value as WorkoutType)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={splitType} onChange={e => setSplitType(e.target.value)} placeholder="Split type (e.g. push, pull)"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !name.trim()}
              className="rounded-xl bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Creating...' : 'Create Template'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Create Template
        </button>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          <p className="text-lg">No templates yet.</p>
          <p className="text-sm mt-1">Create a template above, or one will be auto-generated when you use AI workout planning.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map(t => {
            const structure = Array.isArray(t.structure) ? t.structure : [];
            const exerciseCount = structure.length;

            if (editingId === t.id) {
              return (
                <div key={t.id} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm space-y-3">
                  <h3 className="text-xs font-semibold text-blue-600">Editing Template</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    <select value={editType} onChange={e => setEditType(e.target.value as WorkoutType)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                      {TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input value={editSplit} onChange={e => setEditSplit(e.target.value)} placeholder="Split type"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes"
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} disabled={saving} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{TYPE_ICONS[t.type ?? ''] ?? '💪'}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500">
                        {t.type} · {t.split_type ?? '—'} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                        {t.estimated_duration_min ? ` · ~${t.estimated_duration_min} min` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    {t.ai_generated && (
                      <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">AI</span>
                    )}
                  </div>
                </div>
                {t.notes && <p className="text-xs text-slate-500 mt-2">{t.notes}</p>}
                <div className="mt-3 pt-2 border-t border-slate-100 flex gap-3 items-center">
                  <a
                    href={`/fitness/log?template=${t.id}`}
                    className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-medium"
                  >
                    Use Template
                  </a>
                  <div className="flex-1"></div>
                  <a
                    href={`/fitness/templates/${t.id}/edit`}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                  >
                    Edit Structure
                  </a>
                  <button onClick={() => startEdit(t)} className="text-xs text-slate-400 hover:text-blue-500">Edit Info</button>
                  {confirmDeleteId === t.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">Delete?</span>
                      <button onClick={() => handleDelete(t.id)} className="text-xs text-red-600 font-medium">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(t.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
