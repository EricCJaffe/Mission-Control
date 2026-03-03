'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, TrendingUp, Calendar, Sparkles, Play, Square, Edit2, Trash2, X, Dumbbell } from 'lucide-react';

type FastingLog = {
  id: string;
  fast_start: string;
  fast_end: string | null;
  target_hours: number;
  actual_hours: number | null;
  fast_type: string;
  broke_fast_with: string | null;
  energy_level: number | null;
  hunger_level: number | null;
  workout_during_fast: boolean;
  notes: string | null;
  ai_advice: any;
};

type PlannedWorkout = {
  scheduled_date: string;
  day_label: string | null;
  workout_type: string | null;
  prescribed: any;
};

type Props = {
  fastingLogs: FastingLog[];
  upcomingWorkouts: PlannedWorkout[];
};

export default function FastingTrackerClient({ fastingLogs, upcomingWorkouts }: Props) {
  const router = useRouter();
  const [showNewLogForm, setShowNewLogForm] = useState(false);
  const [showEndFastForm, setShowEndFastForm] = useState(false);
  const [endFastData, setEndFastData] = useState({
    broke_fast_with: '',
    energy_level: 5,
    hunger_level: 5,
    workout_during_fast: false,
    notes: '',
  });
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Find active fast (no end time)
  const activeFast = useMemo(() => {
    return fastingLogs.find(log => !log.fast_end);
  }, [fastingLogs]);

  // Calculate current fasting hours
  const [currentFastingHours, setCurrentFastingHours] = useState<number | null>(null);

  useEffect(() => {
    if (!activeFast) return;

    const updateHours = () => {
      const now = Date.now();
      const start = new Date(activeFast.fast_start).getTime();
      const hours = (now - start) / 3600000;
      setCurrentFastingHours(hours);
    };

    updateHours();
    const interval = setInterval(updateHours, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [activeFast]);

  // Statistics
  const stats = useMemo(() => {
    const completedFasts = fastingLogs.filter(log => log.fast_end && log.actual_hours);

    if (completedFasts.length === 0) {
      return {
        totalFasts: 0,
        avgHours: 0,
        longestFast: 0,
        currentStreak: 0,
      };
    }

    const avgHours = completedFasts.reduce((sum, log) => sum + (log.actual_hours || 0), 0) / completedFasts.length;
    const longestFast = Math.max(...completedFasts.map(log => log.actual_hours || 0));

    // Calculate streak (consecutive days with fasts)
    let streak = 0;
    const sortedLogs = [...completedFasts].sort((a, b) =>
      new Date(b.fast_start).getTime() - new Date(a.fast_start).getTime()
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedLogs.length; i++) {
      const logDate = new Date(sortedLogs[i].fast_start);
      logDate.setHours(0, 0, 0, 0);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      if (logDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalFasts: completedFasts.length,
      avgHours: Math.round(avgHours * 10) / 10,
      longestFast: Math.round(longestFast * 10) / 10,
      currentStreak: streak,
    };
  }, [fastingLogs]);

  // Start a new fast
  const handleStartFast = async () => {
    if (activeFast) {
      alert('You already have an active fast. End it first before starting a new one.');
      return;
    }

    const res = await fetch('/api/fitness/fasting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fast_start: new Date().toISOString(),
        target_hours: 16,
        fast_type: 'intermittent',
      }),
    });

    if (res.ok) {
      router.refresh();
    }
  };

  // End current fast (with details)
  const handleEndFast = async () => {
    if (!activeFast) return;

    const res = await fetch('/api/fitness/fasting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeFast.id,
        fast_end: new Date().toISOString(),
        broke_fast_with: endFastData.broke_fast_with || null,
        energy_level: endFastData.energy_level,
        hunger_level: endFastData.hunger_level,
        workout_during_fast: endFastData.workout_during_fast,
        notes: endFastData.notes || null,
      }),
    });

    if (res.ok) {
      setShowEndFastForm(false);
      setEndFastData({ broke_fast_with: '', energy_level: 5, hunger_level: 5, workout_during_fast: false, notes: '' });
      router.refresh();
    }
  };

  // Get AI advice
  const handleGetAIAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const res = await fetch('/api/fitness/fasting/ai-advice');
      if (res.ok) {
        const data = await res.json();
        setAiAdvice(data.advice);
      }
    } catch (error) {
      console.error('Failed to get AI advice:', error);
    }
    setLoadingAdvice(false);
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Active Fast Card */}
      {activeFast && currentFastingHours !== null && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-blue-600" />
              <h2 className="text-lg font-semibold text-blue-900">Currently Fasting</h2>
            </div>
            <button
              onClick={() => setShowEndFastForm(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
            >
              <Square className="h-4 w-4" />
              End Fast
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-blue-600">Hours Fasted</p>
              <p className="text-3xl font-bold text-blue-900">{currentFastingHours.toFixed(1)}h</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Target</p>
              <p className="text-3xl font-bold text-blue-900">{activeFast.target_hours}h</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Progress</p>
              <p className="text-3xl font-bold text-blue-900">
                {Math.round((currentFastingHours / activeFast.target_hours) * 100)}%
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 h-2 rounded-full bg-blue-200 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.min((currentFastingHours / activeFast.target_hours) * 100, 100)}%` }}
            />
          </div>

          <p className="mt-3 text-sm text-blue-700">
            Started {new Date(activeFast.fast_start).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Quick Actions */}
      {!activeFast && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <button
            onClick={handleStartFast}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 w-full md:w-auto"
          >
            <Play className="h-4 w-4" />
            Start New Fast
          </button>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500">Total Fasts</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.totalFasts}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500">Avg Window</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.avgHours}h</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500">Longest Fast</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.longestFast}h</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
          <p className="text-xs text-slate-500">Current Streak</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.currentStreak} days</p>
        </div>
      </div>

      {/* AI Advisor */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">AI Fasting Advisor</h2>
          </div>
          <button
            onClick={handleGetAIAdvice}
            disabled={loadingAdvice}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {loadingAdvice ? 'Analyzing...' : 'Get Advice'}
          </button>
        </div>

        {aiAdvice ? (
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 text-sm text-purple-900">
            {aiAdvice}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Get personalized fasting window recommendations based on your workout schedule, readiness, and historical patterns.
          </p>
        )}

        {upcomingWorkouts.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Upcoming Workouts:</p>
            <div className="space-y-1">
              {upcomingWorkouts.slice(0, 3).map((workout) => (
                <div key={workout.scheduled_date} className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(workout.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>-</span>
                  <span>{workout.day_label || workout.workout_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Fasts */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Fasting History</h2>
          </div>
          <span className="text-sm text-slate-500">{fastingLogs.length} fasts</span>
        </div>

        {fastingLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p>No fasting logs yet. Start your first fast to begin tracking!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {fastingLogs.slice(0, 20).map((log) => {
              const hours = log.actual_hours || (log.fast_end ?
                ((new Date(log.fast_end).getTime() - new Date(log.fast_start).getTime()) / 3600000) :
                null);

              return (
                <div key={log.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-slate-900">
                          {new Date(log.fast_start).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        {hours && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            hours >= log.target_hours
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {hours.toFixed(1)}h
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {new Date(log.fast_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {log.fast_end && (
                          <> → {new Date(log.fast_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
                        )}
                      </p>
                      {log.broke_fast_with && (
                        <p className="text-xs text-slate-500 mt-1">Broke fast with: {log.broke_fast_with}</p>
                      )}
                      {(log.energy_level || log.hunger_level || log.workout_during_fast) && (
                        <div className="flex gap-3 mt-1 text-xs text-slate-400">
                          {log.energy_level && <span>Energy: {log.energy_level}/10</span>}
                          {log.hunger_level && <span>Hunger: {log.hunger_level}/10</span>}
                          {log.workout_during_fast && <span className="text-blue-500">Trained fasted</span>}
                        </div>
                      )}
                      {log.notes && (
                        <p className="text-xs text-slate-600 mt-1">{log.notes}</p>
                      )}
                    </div>
                    {!log.fast_end && (
                      <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* End Fast Modal */}
      {showEndFastForm && activeFast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">End Fast</h3>
              <button onClick={() => setShowEndFastForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">What are you breaking fast with?</label>
                <input
                  type="text"
                  value={endFastData.broke_fast_with}
                  onChange={e => setEndFastData(prev => ({ ...prev, broke_fast_with: e.target.value }))}
                  placeholder="e.g., Eggs and avocado"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Energy Level: {endFastData.energy_level}/10
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={endFastData.energy_level}
                  onChange={e => setEndFastData(prev => ({ ...prev, energy_level: Number(e.target.value) }))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Low</span><span>High</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Hunger Level: {endFastData.hunger_level}/10
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={endFastData.hunger_level}
                  onChange={e => setEndFastData(prev => ({ ...prev, hunger_level: Number(e.target.value) }))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Not hungry</span><span>Starving</span>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={endFastData.workout_during_fast}
                  onChange={e => setEndFastData(prev => ({ ...prev, workout_during_fast: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-700">Worked out during this fast</span>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={endFastData.notes}
                  onChange={e => setEndFastData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="How did this fast feel?"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEndFast}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
              >
                End Fast
              </button>
              <button
                onClick={() => setShowEndFastForm(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
