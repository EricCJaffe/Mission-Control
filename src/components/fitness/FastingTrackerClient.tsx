'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, TrendingUp, Calendar, Sparkles, Play, Square, Edit2, Trash2 } from 'lucide-react';

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

  // End current fast
  const handleEndFast = async () => {
    if (!activeFast) return;

    const res = await fetch('/api/fitness/fasting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeFast.id,
        fast_end: new Date().toISOString(),
      }),
    });

    if (res.ok) {
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
              onClick={handleEndFast}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
    </div>
  );
}
