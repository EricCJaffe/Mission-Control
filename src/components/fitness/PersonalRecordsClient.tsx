'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, Trash2 } from 'lucide-react';
import OneRMProgressionChart from './OneRMProgressionChart';
import {
  WINDOWS,
  computeCurrentBests,
  monthsAgo,
  type CurrentBest,
  type SetRow,
} from '@/lib/fitness/current-bests';

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
  /** All-time bests, from personal_records. */
  records: PRRecord[];
  /** Twelve months of sets, for computing where he is now. */
  recentSets: SetRow[];
};

/**
 * Record types, in the order they are offered.
 *
 * Estimated 1RM leads, and is the default, because it is the one number that
 * compares across rep ranges — a heavy triple and a lighter set of eight are
 * not otherwise comparable, and it is what you want to see going up.
 */
const RECORD_TYPES = [
  { key: 'estimated_1rm', label: 'Est. 1RM' },
  { key: 'max_weight', label: 'Max Weight' },
  { key: 'max_reps', label: 'Max Reps' },
  { key: 'max_volume', label: 'Max Volume' },
  { key: 'best_pace', label: 'Best Pace' },
  { key: 'fastest_5k', label: 'Fastest 5K' },
  { key: 'longest_ride', label: 'Longest Ride' },
  { key: 'longest_z2_drift', label: 'Longest Z2' },
  { key: 'lowest_rhr', label: 'Lowest RHR' },
  { key: 'highest_hrv', label: 'Highest HRV' },
] as const;

const DEFAULT_TYPE = 'estimated_1rm';

/** For these a "best" is the lowest value, not the highest. */
const LOWER_IS_BETTER = new Set(['best_pace', 'fastest_5k', 'lowest_rhr']);

function formatValue(value: number, unit: string | null, type: string): string {
  if (type === 'best_pace') {
    const mins = Math.floor(value);
    const secs = Math.round((value - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}${unit ? ` ${unit}` : ''}`;
  }
  if (Number.isInteger(value)) return `${value}${unit ? ` ${unit}` : ''}`;
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * One row per exercise, alphabetical, with the record type as a filter.
 *
 * Previously every exercise appeared once for each record type it had — 120
 * rows across 32 exercises, up to seven lines for a single lift — so finding
 * "what is my bench" meant reading past six other numbers about bench. The
 * type is now a filter and the list is alphabetical, which is how you look
 * something up when you already know what you are after.
 */
export default function PersonalRecordsClient({ records: initial, recentSets }: Props) {
  const [records, setRecords] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>(DEFAULT_TYPE);
  const [windowKey, setWindowKey] = useState<string>('12');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);

  /** Only offer types that actually have records, with their counts. */
  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) counts.set(r.record_type, (counts.get(r.record_type) ?? 0) + 1);
    return RECORD_TYPES.filter((t) => counts.has(t.key)).map((t) => ({
      ...t,
      count: counts.get(t.key) ?? 0,
    }));
  }, [records]);

  /**
   * Best record per exercise for the selected type.
   *
   * There are several rows per exercise and type as a lift improves, so the
   * best wins rather than whichever came back first — and for pace-style
   * records the best is the lowest.
   */
  const currentBests = useMemo(() => {
    const months = WINDOWS.find((w) => w.key === windowKey)?.months ?? 12;
    // 'All time' still needs a floor; the fetch only covers twelve months, so
    // that option shows the all-time column as the headline instead.
    return computeCurrentBests(recentSets, months > 0 ? monthsAgo(months) : '0000-01-01');
  }, [recentSets, windowKey]);

  /** Current value for the selected record type, where one can be derived. */
  const currentValue = (best: CurrentBest | undefined): number | null => {
    if (!best) return null;
    if (type === 'estimated_1rm') return best.e1rm || null;
    if (type === 'max_weight') return best.maxWeight || null;
    if (type === 'max_reps') return best.maxReps || null;
    return null;
  };

  const rows = useMemo(() => {
    const best = new Map<string, PRRecord>();
    for (const r of records) {
      if (r.record_type !== type) continue;
      const key = r.exercise_name ?? r.exercise_id ?? r.id;
      const current = best.get(key);
      if (!current) {
        best.set(key, r);
        continue;
      }
      const better = LOWER_IS_BETTER.has(type) ? r.value < current.value : r.value > current.value;
      if (better) best.set(key, r);
    }

    const q = search.trim().toLowerCase();
    return [...best.values()]
      .filter((r) => !q || (r.exercise_name ?? '').toLowerCase().includes(q))
      .sort((a, b) =>
        (a.exercise_name ?? '').localeCompare(b.exercise_name ?? '', undefined, {
          sensitivity: 'base',
        })
      );
  }, [records, type, search]);

  const historyFor = (exerciseName: string | null) =>
    records
      .filter((r) => r.exercise_name === exerciseName)
      .sort((a, b) => b.achieved_date.localeCompare(a.achieved_date));

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
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(data.error || 'Failed to delete record');
      }
    } catch {
      setError('Network error — could not delete record');
    }
  }

  const activeLabel = RECORD_TYPES.find((t) => t.key === type)?.label ?? type;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {rows.length} exercise{rows.length === 1 ? '' : 's'} · {activeLabel} ·{' '}
          <span className="text-amber-700">amber</span> is your all-time best
        </p>
        <button
          onClick={handleRecalculate}
          disabled={recalcLoading}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${recalcLoading ? 'animate-spin' : ''}`} />
          {recalcLoading ? 'Calculating…' : 'Recalculate'}
        </button>
      </div>

      {recalcMsg && (
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">{recalcMsg}</p>
      )}
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* The type is a filter now rather than a reason to repeat every row. */}
      <div className="flex flex-wrap gap-1.5">
        {availableTypes.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setType(t.key);
              setExpanded(null);
            }}
            className={`min-h-[36px] rounded-xl px-3 text-sm font-semibold transition-colors ${
              type === t.key
                ? 'bg-blue-700 text-white'
                : 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${type === t.key ? 'text-blue-200' : 'text-slate-400'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* How recent counts as "now". */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Current =
        </span>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWindowKey(w.key)}
            className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
              windowKey === w.key
                ? 'bg-slate-800 text-white'
                : 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find an exercise…"
          aria-label="Search exercises"
          className="min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white pl-9 pr-3 text-base focus:border-blue-600 focus:outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {search ? `Nothing matching “${search}”.` : `No ${activeLabel} records yet.`}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
          {rows.map((r, i) => {
            const key = r.exercise_name ?? r.id;
            const isOpen = expanded === key;
            return (
              <div key={r.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {r.exercise_name ?? 'Unnamed'}
                  </span>
                  {(() => {
                    const best = r.exercise_id ? currentBests.get(r.exercise_id) : undefined;
                    const now = currentValue(best);
                    const allTime = r.value;
                    // "Where I am now" is the headline; the all-time peak sits
                    // beneath it only when it is actually higher, so it reads
                    // as something to aim at rather than as noise on every row.
                    const showPast = now !== null && allTime > now;
                    return (
                      <span className="shrink-0 text-right">
                        {now !== null ? (
                          <>
                            <span className="block text-base font-bold tabular-nums text-slate-900">
                              {formatValue(now, r.unit, r.record_type)}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {best ? shortDate(best.achievedOn) : ''}
                            </span>
                            {showPast && (
                              <span className="mt-0.5 block text-[11px] text-amber-700">
                                was {formatValue(allTime, r.unit, r.record_type)} ·{' '}
                                {r.achieved_date.slice(0, 4)}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="block text-base font-bold tabular-nums text-slate-400">
                              {formatValue(allTime, r.unit, r.record_type)}
                            </span>
                            <span className="block text-[11px] text-amber-700">
                              all-time · {r.achieved_date.slice(0, 4)}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              not trained recently
                            </span>
                          </>
                        )}
                      </span>
                    );
                  })()}
                </button>

                {/* Expanding shows every record for that exercise, which is
                    where the other types went. */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      All records for this exercise
                    </p>
                    <div className="space-y-1">
                      {historyFor(r.exercise_name).map((h) => (
                        <div key={h.id} className="flex items-center gap-2 text-xs">
                          <span className="w-24 shrink-0 text-slate-500">
                            {RECORD_TYPES.find((t) => t.key === h.record_type)?.label ?? h.record_type}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            {formatValue(h.value, h.unit, h.record_type)}
                          </span>
                          <span className="text-slate-400">{shortDate(h.achieved_date)}</span>
                          {confirmDeleteId === h.id ? (
                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                              <button
                                onClick={() => handleDelete(h.id)}
                                className="text-xs font-bold text-rose-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-slate-500"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(h.id)}
                              aria-label={`Delete this ${h.record_type} record`}
                              className="ml-auto shrink-0 text-slate-300 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <OneRMProgressionChart records={records} />
    </div>
  );
}
