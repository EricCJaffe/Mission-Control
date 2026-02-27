'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SetType } from '@/lib/fitness/types';
import type { ReactNode } from 'react';
import { Dumbbell, PersonStanding, Zap, RefreshCw } from 'lucide-react';

type WorkoutRow = {
  id: string;
  workout_date: string;
  workout_type: string;
  duration_minutes: number | null;
  tss: number | null;
  compliance_pct: number | null;
  compliance_color: string | null;
  rpe_session: number | null;
  notes: string | null;
  ai_summary: string | null;
  source: string | null;
  strain_score: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  template_id: string | null;
  template_name: string | null;
};

type SetRow = {
  id: string;
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
  exercises: { name: string; category: string } | null;
};

type CardioDetail = {
  activity_type: string;
  avg_hr: number | null;
  max_hr: number | null;
  distance_miles: number | null;
  avg_pace_per_mile: string | null;
  calories: number | null;
  hr_recovery_1min: number | null;
  hr_recovery_2min: number | null;
  time_in_zone1_min: number | null;
  time_in_zone2_min: number | null;
  time_in_zone3_min: number | null;
  time_in_zone4_min: number | null;
  z2_drift_duration_min: number | null;
  cardiac_efficiency: number | null;
};

type Props = {
  workouts: WorkoutRow[];
};

const WORKOUT_ICONS: Record<string, ReactNode> = {
  strength: <Dumbbell size={20} />, cardio: <PersonStanding size={20} />, hiit: <Zap size={20} />, hybrid: <RefreshCw size={20} />,
};

const COMPLIANCE_BG: Record<string, string> = {
  green: 'bg-green-500', yellow: 'bg-yellow-400', orange: 'bg-orange-400', red: 'bg-red-500',
};

const SET_TYPE_COLORS: Record<string, string> = {
  warmup: 'bg-blue-100 text-blue-700',
  working: 'bg-slate-800 text-white',
  cooldown: 'bg-green-100 text-green-700',
  drop: 'bg-purple-100 text-purple-700',
  failure: 'bg-red-100 text-red-700',
  amrap: 'bg-orange-100 text-orange-700',
};

const SET_TYPE_SHORT: Record<string, string> = {
  warmup: 'W', working: 'S', cooldown: 'C', drop: 'D', failure: 'F', amrap: 'A',
};

export default function WorkoutHistoryClient({ workouts }: Props) {
  const [filter, setFilter] = useState<'all' | 'strength' | 'cardio' | 'hiit' | 'hybrid'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, { sets: SetRow[]; cardio: CardioDetail | null }>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    if (detailCache[id]) return;

    setLoadingDetail(id);
    try {
      const res = await fetch(`/api/fitness/workouts?id=${id}`);
      const data = await res.json();
      if (data.workout) {
        setDetailCache(prev => ({
          ...prev,
          [id]: { sets: data.workout.sets ?? [], cardio: data.workout.cardio ?? null },
        }));
      }
    } catch {
      setError('Failed to load workout details');
    }
    setLoadingDetail(null);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/workouts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setDeletedIds(prev => new Set(prev).add(id));
        setConfirmDeleteId(null);
        if (expandedId === id) setExpandedId(null);
      } else {
        setError(data.error || 'Failed to delete workout');
      }
    } catch {
      setError('Network error — could not delete workout');
    }
  }

  const filtered = workouts
    .filter(w => !deletedIds.has(w.id))
    .filter(w => filter === 'all' || w.workout_type === filter);

  // Group by month
  const grouped = new Map<string, WorkoutRow[]>();
  for (const w of filtered) {
    const d = new Date(w.workout_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(w);
  }

  function renderSetTable(sets: SetRow[]) {
    // Group sets by exercise
    const byExercise = new Map<string, SetRow[]>();
    for (const s of sets) {
      const key = s.exercise_id ?? 'unknown';
      if (!byExercise.has(key)) byExercise.set(key, []);
      byExercise.get(key)!.push(s);
    }

    return (
      <div className="space-y-3">
        {[...byExercise.entries()].map(([exId, exSets]) => {
          const name = exSets[0]?.exercises?.name ?? 'Unknown Exercise';
          const hasPR = exSets.some(s => s.is_pr);
          return (
            <div key={exId} className="rounded-xl border border-slate-100 bg-white/50 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50/80 flex items-center gap-2">
                <p className="text-sm font-medium text-slate-700 flex-1">{name}</p>
                {hasPR && <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">PR</span>}
                {exSets[0]?.superset_group && (
                  <span className="text-xs bg-purple-100 text-purple-600 rounded-full px-2 py-0.5">SS</span>
                )}
              </div>
              <div className="px-3 py-1.5">
                <div className="grid grid-cols-[2rem_3rem_4rem_4rem_3rem] gap-1 text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                  <span>#</span><span>Type</span><span>Weight</span><span>Reps</span><span>RPE</span>
                </div>
                {exSets.map((s, i) => (
                  <div key={s.id || i} className={`grid grid-cols-[2rem_3rem_4rem_4rem_3rem] gap-1 py-1 text-sm ${s.is_pr ? 'bg-amber-50 -mx-1 px-1 rounded' : ''}`}>
                    <span className="text-xs text-slate-400">{s.set_number}</span>
                    <span className={`text-[10px] font-medium rounded px-1 py-0.5 text-center w-fit ${SET_TYPE_COLORS[s.set_type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {SET_TYPE_SHORT[s.set_type] ?? s.set_type}
                    </span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {s.weight_lbs != null ? `${s.weight_lbs}` : '—'}
                    </span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {s.reps != null ? s.reps : '—'}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {s.rpe != null ? s.rpe : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCardio(cardio: CardioDetail) {
    const zones = [
      { label: 'Z1', val: cardio.time_in_zone1_min, color: 'bg-blue-200' },
      { label: 'Z2', val: cardio.time_in_zone2_min, color: 'bg-green-200' },
      { label: 'Z3', val: cardio.time_in_zone3_min, color: 'bg-yellow-200' },
      { label: 'Z4', val: cardio.time_in_zone4_min, color: 'bg-red-200' },
    ].filter(z => z.val != null && z.val > 0);

    const totalZone = zones.reduce((s, z) => s + (z.val ?? 0), 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {cardio.activity_type && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Activity</p>
              <p className="text-sm font-medium text-slate-700 capitalize">{cardio.activity_type}</p>
            </div>
          )}
          {cardio.distance_miles != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Distance</p>
              <p className="text-sm font-medium text-slate-700">{cardio.distance_miles.toFixed(2)} mi</p>
            </div>
          )}
          {cardio.avg_hr != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Avg HR</p>
              <p className="text-sm font-medium text-slate-700">{cardio.avg_hr} bpm</p>
            </div>
          )}
          {cardio.max_hr != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Max HR</p>
              <p className="text-sm font-medium text-slate-700">{cardio.max_hr} bpm</p>
            </div>
          )}
          {cardio.avg_pace_per_mile && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Avg Pace</p>
              <p className="text-sm font-medium text-slate-700">{cardio.avg_pace_per_mile}/mi</p>
            </div>
          )}
          {cardio.calories != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Calories</p>
              <p className="text-sm font-medium text-slate-700">{cardio.calories}</p>
            </div>
          )}
          {cardio.hr_recovery_1min != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">HR Rec 1m</p>
              <p className="text-sm font-medium text-slate-700">{cardio.hr_recovery_1min} bpm</p>
            </div>
          )}
          {cardio.cardiac_efficiency != null && (
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Cardiac Eff.</p>
              <p className="text-sm font-medium text-slate-700">{cardio.cardiac_efficiency.toFixed(3)}</p>
            </div>
          )}
        </div>

        {/* Zone bar */}
        {totalZone > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase mb-1">Time in Zones</p>
            <div className="flex rounded-lg overflow-hidden h-5">
              {zones.map(z => (
                <div
                  key={z.label}
                  className={`${z.color} flex items-center justify-center text-[10px] font-medium text-slate-700`}
                  style={{ width: `${((z.val ?? 0) / totalZone) * 100}%` }}
                >
                  {(z.val ?? 0) >= 3 ? `${z.label} ${Math.round(z.val ?? 0)}m` : ''}
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Filter tabs */}
      <div className="flex gap-1.5 items-center">
        {(['all', 'strength', 'cardio', 'hiit', 'hybrid'] as const).map(f => (
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
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} workouts</span>
      </div>

      {/* Workouts by month */}
      {grouped.size > 0 ? (
        [...grouped.entries()].map(([monthKey, monthWorkouts]) => {
          const [year, month] = monthKey.split('-');
          const monthLabel = new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          return (
            <div key={monthKey}>
              <h2 className="text-sm font-semibold text-slate-500 mb-2">{monthLabel} ({monthWorkouts.length})</h2>
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
                {monthWorkouts.map(w => {
                  const isExpanded = expandedId === w.id;
                  const detail = detailCache[w.id];
                  const isLoading = loadingDetail === w.id;
                  const d = new Date(w.workout_date);

                  return (
                    <div key={w.id}>
                      {/* Row */}
                      <button
                        onClick={() => toggleDetail(w.id)}
                        className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
                      >
                        <span className="shrink-0">{WORKOUT_ICONS[w.workout_type] ?? <Dumbbell size={20} />}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-700 capitalize">{w.workout_type}</p>
                            {w.template_name && (
                              <span className="text-xs text-slate-400 truncate">({w.template_name})</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {w.duration_minutes ? ` · ${w.duration_minutes} min` : ''}
                            {w.tss ? ` · TSS ${Math.round(w.tss)}` : ''}
                            {w.strain_score != null ? ` · Strain ${w.strain_score}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {w.rpe_session && (
                            <span className="text-xs text-slate-500 font-medium">RPE {w.rpe_session}</span>
                          )}
                          {w.compliance_color && (
                            <span className={`h-2.5 w-2.5 rounded-full ${COMPLIANCE_BG[w.compliance_color] ?? ''}`} />
                          )}
                          <span className="text-xs text-slate-300">{isExpanded ? '▼' : '▶'}</span>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-5 pb-4 pt-1 border-t border-slate-100 bg-slate-50/30 space-y-3">
                          {isLoading && (
                            <p className="text-sm text-slate-400 animate-pulse">Loading details...</p>
                          )}

                          {/* Workout meta */}
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500 items-center">
                            {w.avg_hr != null && <span>Avg HR: {w.avg_hr} bpm</span>}
                            {w.max_hr != null && <span>Max HR: {w.max_hr} bpm</span>}
                            {w.source && w.source !== 'manual' && (
                              <span className="text-blue-500 capitalize">Source: {w.source}</span>
                            )}
                            {w.compliance_pct != null && (
                              <span>Compliance: {Math.round(w.compliance_pct)}%</span>
                            )}
                            <Link
                              href={`/fitness/history/${w.id}`}
                              className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 min-h-[32px] flex items-center"
                            >
                              View Full Details
                            </Link>
                          </div>

                          {/* Notes */}
                          {w.notes && (
                            <div className="rounded-lg bg-white p-3 border border-slate-100">
                              <p className="text-xs text-slate-400 mb-0.5">Notes</p>
                              <p className="text-sm text-slate-700">{w.notes}</p>
                            </div>
                          )}

                          {/* AI Summary */}
                          {w.ai_summary && (
                            <div className="rounded-lg bg-blue-50/50 p-3 border border-blue-100">
                              <p className="text-xs text-blue-500 mb-0.5">AI Summary</p>
                              <p className="text-sm text-slate-700">{w.ai_summary}</p>
                            </div>
                          )}

                          {/* Sets (strength) */}
                          {detail && detail.sets.length > 0 && renderSetTable(detail.sets)}

                          {/* Cardio detail */}
                          {detail?.cardio && renderCardio(detail.cardio)}

                          {/* Actions */}
                          <div className="flex items-center gap-3 pt-1">
                            <Link
                              href={`/fitness/log?repeat=${w.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium min-h-[32px] flex items-center"
                            >
                              Repeat this workout
                            </Link>
                            <div className="flex-1" />
                            {confirmDeleteId === w.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">Delete this workout?</span>
                                <button onClick={() => handleDelete(w.id)} className="text-xs text-red-600 font-medium">Yes</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(w.id)}
                                className="text-xs text-slate-300 hover:text-red-400">Delete</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">
            {workouts.length === 0
              ? 'No workouts logged yet. Start your first workout from the dashboard!'
              : 'No workouts match this filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
