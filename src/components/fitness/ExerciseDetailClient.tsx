'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { ArrowLeft, TrendingUp, Calendar, Dumbbell } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type Exercise = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  muscle_groups: string[];
  is_compound: boolean;
  notes: string | null;
};

type SetLog = {
  id: string;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  workout_logs: {
    id: string;
    workout_date: string;
    workout_type: string;
    duration_minutes: number | null;
    rpe_session: number | null;
    notes: string | null;
  };
};

type OneRmRecord = {
  id: string;
  value: number;
  unit: string;
  achieved_date: string;
  notes: string | null;
};

type Props = {
  exercise: Exercise;
  setLogs: SetLog[];
  oneRmRecords: OneRmRecord[];
};

export default function ExerciseDetailClient({ exercise, setLogs, oneRmRecords }: Props) {
  const router = useRouter();

  // Group sets by workout
  const workoutHistory = useMemo(() => {
    const grouped = new Map<string, {
      workout_id: string;
      date: string;
      sets: SetLog[];
      workout_type: string;
      duration_minutes: number | null;
      rpe_session: number | null;
    }>();

    for (const set of setLogs) {
      const workoutId = set.workout_logs.id;
      if (!grouped.has(workoutId)) {
        grouped.set(workoutId, {
          workout_id: workoutId,
          date: set.workout_logs.workout_date,
          sets: [],
          workout_type: set.workout_logs.workout_type,
          duration_minutes: set.workout_logs.duration_minutes,
          rpe_session: set.workout_logs.rpe_session,
        });
      }
      grouped.get(workoutId)!.sets.push(set);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [setLogs]);

  // Chart data: max weight per workout
  const maxWeightData = useMemo(() => {
    return workoutHistory.map(w => {
      const maxWeight = Math.max(...w.sets.map(s => s.weight_lbs || 0));
      return {
        date: new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weight: maxWeight,
        fullDate: w.date,
      };
    }).reverse(); // Chronological order for chart
  }, [workoutHistory]);

  // Chart data: total volume per workout (sets × reps × weight)
  const volumeData = useMemo(() => {
    return workoutHistory.map(w => {
      const volume = w.sets.reduce((sum, s) => {
        return sum + ((s.reps || 0) * (s.weight_lbs || 0));
      }, 0);
      return {
        date: new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        volume,
        fullDate: w.date,
      };
    }).reverse();
  }, [workoutHistory]);

  // Chart data: average RPE per workout
  const rpeData = useMemo(() => {
    return workoutHistory.map(w => {
      const rpeSets = w.sets.filter(s => s.rpe != null);
      const avgRpe = rpeSets.length > 0
        ? rpeSets.reduce((sum, s) => sum + (s.rpe || 0), 0) / rpeSets.length
        : null;
      return {
        date: new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rpe: avgRpe,
        fullDate: w.date,
      };
    }).reverse();
  }, [workoutHistory]);

  // Chart data: estimated 1RM progression
  const oneRmData = useMemo(() => {
    return oneRmRecords.map(record => ({
      date: new Date(record.achieved_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      oneRm: Number(record.value),
      fullDate: record.achieved_date,
      notes: record.notes,
    }));
  }, [oneRmRecords]);

  // Overall stats
  const stats = useMemo(() => {
    const allWeights = setLogs.map(s => s.weight_lbs || 0).filter(w => w > 0);
    const allReps = setLogs.map(s => s.reps || 0).filter(r => r > 0);
    const totalVolume = setLogs.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight_lbs || 0)), 0);
    const best1RM = oneRmRecords.length > 0
      ? Math.max(...oneRmRecords.map(r => Number(r.value)))
      : null;

    return {
      maxWeight: allWeights.length > 0 ? Math.max(...allWeights) : 0,
      avgReps: allReps.length > 0 ? Math.round(allReps.reduce((a, b) => a + b, 0) / allReps.length) : 0,
      totalSets: setLogs.length,
      totalVolume,
      workouts: workoutHistory.length,
      best1RM,
    };
  }, [setLogs, workoutHistory, oneRmRecords]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/fitness/exercises')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </button>
      </div>

      {/* Exercise Info Card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{exercise.name}</h1>
            <div className="flex gap-3 mt-2 text-sm text-slate-600">
              <span className="px-2 py-1 rounded-lg bg-slate-100">{exercise.category}</span>
              {exercise.equipment && (
                <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700">{exercise.equipment}</span>
              )}
              {exercise.is_compound && (
                <span className="px-2 py-1 rounded-lg bg-green-50 text-green-700">Compound</span>
              )}
            </div>
            {exercise.muscle_groups.length > 0 && (
              <p className="text-sm text-slate-500 mt-2">
                Muscles: {exercise.muscle_groups.join(', ')}
              </p>
            )}
          </div>
          <Dumbbell className="h-12 w-12 text-slate-300" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.maxWeight}</p>
            <p className="text-xs text-slate-500 mt-1">Max Weight (lbs)</p>
          </div>
          {stats.best1RM && (
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-700">{stats.best1RM}</p>
              <p className="text-xs text-slate-500 mt-1">Best 1RM (lbs)</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.avgReps}</p>
            <p className="text-xs text-slate-500 mt-1">Avg Reps</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.totalSets}</p>
            <p className="text-xs text-slate-500 mt-1">Total Sets</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.totalVolume.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Total Volume</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.workouts}</p>
            <p className="text-xs text-slate-500 mt-1">Workouts</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      {workoutHistory.length > 1 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Max Weight Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Max Weight Progression
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={maxWeightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Volume Chart */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Total Volume Progression
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="volume" stroke="#10b981" fill="#dcfce7" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Estimated 1RM Chart */}
          {oneRmData.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                Estimated 1RM Progression
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={oneRmData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="oneRm"
                    stroke="#9333ea"
                    strokeWidth={2}
                    dot={{ fill: '#9333ea', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Workout History Table */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Workout History</h2>
          <span className="ml-auto text-sm text-slate-500">{workoutHistory.length} workouts</span>
        </div>

        {workoutHistory.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p>No workout history yet for this exercise.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {workoutHistory.map((workout) => {
              const maxWeight = Math.max(...workout.sets.map(s => s.weight_lbs || 0));
              const totalSets = workout.sets.length;
              const avgReps = Math.round(
                workout.sets.reduce((sum, s) => sum + (s.reps || 0), 0) / totalSets
              );

              return (
                <div key={workout.workout_id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <button
                        onClick={() => router.push(`/fitness/history/${workout.workout_id}`)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        {new Date(workout.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </button>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {workout.workout_type} • {totalSets} sets • Max {maxWeight}lbs
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {avgReps} avg reps
                    </span>
                  </div>

                  {/* Sets breakdown */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {workout.sets.map((set, idx) => (
                      <div
                        key={idx}
                        className="px-2 py-1 rounded bg-slate-100 text-xs text-slate-700"
                      >
                        {set.reps || '?'}r @ {set.weight_lbs || 0}lbs
                        {set.rpe && ` (RPE ${set.rpe})`}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
