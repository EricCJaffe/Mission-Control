'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

type PRRecord = {
  id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  record_type: string;
  value: number;
  unit: string | null;
  achieved_date: string;
  notes: string | null;
};

type Props = {
  records: PRRecord[];
};

const RECORD_TYPE_LABELS: Record<string, string> = {
  max_weight: 'Max Weight',
  max_reps: 'Max Reps',
  max_volume: 'Max Volume',
  estimated_1rm: 'Est. 1RM',
  best_pace: 'Best Pace',
  longest_z2_drift: 'Longest Z2 Drift',
  lowest_rhr: 'Lowest RHR',
  highest_hrv: 'Highest HRV',
  fastest_5k: 'Fastest 5K',
  longest_ride: 'Longest Ride',
};

const RECORD_TYPE_COLORS: Record<string, string> = {
  max_weight: 'bg-red-100 text-red-700 border-red-200',
  max_reps: 'bg-orange-100 text-orange-700 border-orange-200',
  max_volume: 'bg-amber-100 text-amber-700 border-amber-200',
  estimated_1rm: 'bg-purple-100 text-purple-700 border-purple-200',
  best_pace: 'bg-green-100 text-green-700 border-green-200',
  longest_z2_drift: 'bg-blue-100 text-blue-700 border-blue-200',
  lowest_rhr: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  highest_hrv: 'bg-teal-100 text-teal-700 border-teal-200',
  fastest_5k: 'bg-green-100 text-green-700 border-green-200',
  longest_ride: 'bg-sky-100 text-sky-700 border-sky-200',
};

const CATEGORY_ORDER = ['strength', 'cardio', 'health'] as const;

function categorize(type: string): 'strength' | 'cardio' | 'health' {
  if (['max_weight', 'max_reps', 'max_volume', 'estimated_1rm'].includes(type)) return 'strength';
  if (['best_pace', 'longest_z2_drift', 'fastest_5k', 'longest_ride'].includes(type)) return 'cardio';
  return 'health';
}

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength PRs',
  cardio: 'Cardio PRs',
  health: 'Health Milestones',
};

function formatValue(value: number, unit: string | null, type: string): string {
  if (type === 'best_pace') {
    const mins = Math.floor(value);
    const secs = Math.round((value - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}${unit ? ` ${unit}` : ''}`;
  }
  if (type === 'longest_z2_drift' || type === 'fastest_5k') {
    return `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
  }
  if (Number.isInteger(value)) {
    return `${value}${unit ? ` ${unit}` : ''}`;
  }
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

export default function PersonalRecordsClient({ records: initial }: Props) {
  const [records, setRecords] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'strength' | 'cardio' | 'health'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);

  async function handleRecalculate() {
    setRecalcLoading(true);
    setRecalcMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/fitness/records/recalculate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Recalculate failed');
        return;
      }
      const { exercises_analyzed, records_created } = data.summary;
      setRecalcMsg(`Calculated ${records_created} PRs across ${exercises_analyzed} exercises.`);
      // Reload page to reflect new records
      window.location.reload();
    } catch {
      setError('Network error — could not recalculate PRs');
    } finally {
      setRecalcLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/records?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(data.error || 'Failed to delete record');
      }
    } catch {
      setError('Network error — could not delete record');
    }
  }

  const filtered = filter === 'all' ? records : records.filter(r => categorize(r.record_type) === filter);

  // Group by category for display
  const grouped = new Map<string, PRRecord[]>();
  for (const cat of CATEGORY_ORDER) {
    const catRecords = filtered.filter(r => categorize(r.record_type) === cat);
    if (catRecords.length > 0) grouped.set(cat, catRecords);
  }

  // Summary stats
  const totalPRs = records.length;
  const strengthCount = records.filter(r => categorize(r.record_type) === 'strength').length;
  const cardioCount = records.filter(r => categorize(r.record_type) === 'cardio').length;
  const recentPR = records[0];

  // Group by exercise for strength PRs to show latest per exercise
  const latestByExercise = new Map<string, PRRecord>();
  for (const r of records) {
    if (r.exercise_name && categorize(r.record_type) === 'strength') {
      const key = `${r.exercise_name}:${r.record_type}`;
      if (!latestByExercise.has(key)) {
        latestByExercise.set(key, r);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Recalculate banner */}
      {recalcMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-green-700">{recalcMsg}</p>
          <button onClick={() => setRecalcMsg(null)} className="text-xs text-green-500 hover:text-green-700">Dismiss</button>
        </div>
      )}

      {/* Recalculate PRs button */}
      <div className="flex justify-end">
        <button
          onClick={handleRecalculate}
          disabled={recalcLoading}
          className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${recalcLoading ? 'animate-spin' : ''}`} />
          {recalcLoading ? 'Calculating…' : 'Recalculate PRs from History'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500 mb-1">Total PRs</p>
          <p className="text-2xl font-bold text-slate-800">{totalPRs}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500 mb-1">Strength</p>
          <p className="text-2xl font-bold text-red-600">{strengthCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500 mb-1">Cardio</p>
          <p className="text-2xl font-bold text-green-600">{cardioCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500 mb-1">Most Recent</p>
          {recentPR ? (
            <p className="text-sm font-medium text-slate-700 truncate">{new Date(recentPR.achieved_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          ) : (
            <p className="text-sm text-slate-400">None yet</p>
          )}
        </div>
      </div>

      {/* Current bests */}
      {latestByExercise.size > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Current Bests</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {[...latestByExercise.entries()].map(([key, r]) => (
              <div key={key} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{r.exercise_name}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 border ${RECORD_TYPE_COLORS[r.record_type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-slate-800">
                    {formatValue(r.value, r.unit, r.record_type)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(r.achieved_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(['all', 'strength', 'cardio', 'health'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize min-h-[32px] ${
              filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Records by category */}
      {grouped.size > 0 ? (
        [...grouped.entries()].map(([cat, catRecords]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-slate-600 mb-2">{CATEGORY_LABELS[cat] ?? cat}</h2>
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
              {catRecords.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-800">
                        {r.exercise_name ?? (RECORD_TYPE_LABELS[r.record_type] ?? r.record_type)}
                      </p>
                      <span className={`text-xs rounded-full px-2 py-0.5 border shrink-0 ${RECORD_TYPE_COLORS[r.record_type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}
                      </span>
                    </div>
                    {r.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums text-slate-800">
                      {formatValue(r.value, r.unit, r.record_type)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(r.achieved_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {confirmDeleteId === r.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(r.id)} className="text-xs text-red-600 font-medium">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(r.id)}
                        className="text-xs text-slate-300 hover:text-red-400">Del</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">
            {records.length === 0
              ? 'No personal records yet. PRs are auto-detected when you log workouts — your first lift or run will set the baseline!'
              : 'No records match this filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
