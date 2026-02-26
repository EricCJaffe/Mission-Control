'use client';

import { useState } from 'react';
import Link from 'next/link';

type PlanRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  cycle_weeks: number | null;
  plan_type: string | null;
  status: string;
  config: Record<string, unknown> | null;
};

type PlannedWorkout = {
  id: string;
  scheduled_date: string;
  day_label: string | null;
  workout_type: string | null;
  prescribed: Record<string, unknown>;
};

type Props = {
  plans: PlanRow[];
  upcomingWorkouts: PlannedWorkout[];
  activePlanId: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-slate-100 text-slate-600',
  draft: 'bg-yellow-100 text-yellow-800',
};

export default function TrainingPlansClient({ plans: initial, upcomingWorkouts, activePlanId }: Props) {
  const [plans, setPlans] = useState(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [cycleWeeks, setCycleWeeks] = useState('4');
  const [planType, setPlanType] = useState('strength');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setName(''); setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(''); setCycleWeeks('4'); setPlanType('strength'); setNotes('');
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!name || !startDate || !endDate) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/fitness/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          start_date: startDate,
          end_date: endDate,
          cycle_weeks: parseInt(cycleWeeks) || 4,
          plan_type: planType,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlans(prev => [data.plan, ...prev]);
        resetForm();
      } else {
        setError(data.error || 'Failed to create plan');
      }
    } catch {
      setError('Network error — could not create plan');
    }
    setSaving(false);
  }

  async function handleStatusToggle(plan: PlanRow) {
    setError(null);
    const newStatus = plan.status === 'active' ? 'completed' : 'active';
    try {
      const res = await fetch('/api/fitness/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlans(prev => prev.map(p => p.id === plan.id ? data.plan : p));
      } else {
        setError(data.error || 'Failed to update plan');
      }
    } catch {
      setError('Network error — could not update plan');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/plans?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setPlans(prev => prev.filter(p => p.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(data.error || 'Failed to delete plan');
      }
    } catch {
      setError('Network error — could not delete plan');
    }
  }

  const activePlan = plans.find(p => p.status === 'active');

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Create form */}
      {showCreate ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">New Training Plan</h2>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Plan Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g., April Hypertrophy Block"
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cycle Length (weeks)</label>
              <select value={cycleWeeks} onChange={e => setCycleWeeks(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                {[2, 3, 4, 5, 6, 8, 12].map(w => (
                  <option key={w} value={w}>{w} weeks</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Plan Type</label>
              <select value={planType} onChange={e => setPlanType(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                <option value="strength">Strength</option>
                <option value="hypertrophy">Hypertrophy</option>
                <option value="endurance">Endurance</option>
                <option value="cardiac_rehab">Cardiac Rehab</option>
                <option value="hybrid">Hybrid</option>
                <option value="deload">Deload</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Goals, focus areas, constraints..."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !name || !startDate || !endDate}
              className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Creating...' : 'Create Plan'}
            </button>
            <button onClick={resetForm}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Create Training Plan
        </button>
      )}

      {/* Active plan */}
      {activePlan && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">Active Plan</h2>
          <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">{activePlan.name}</h3>
              <span className="text-xs bg-green-100 text-green-800 rounded-full px-2.5 py-0.5 font-medium">Active</span>
            </div>
            <p className="text-sm text-slate-500">
              {activePlan.start_date} → {activePlan.end_date}
              {activePlan.cycle_weeks ? ` · ${activePlan.cycle_weeks}-week cycles` : ''}
              {activePlan.plan_type ? ` · ${activePlan.plan_type}` : ''}
            </p>
            {activePlan.config && activePlan.config.notes ? (
              <p className="text-xs text-slate-400 mt-1">{String(activePlan.config.notes)}</p>
            ) : null}
            <div className="flex gap-2 mt-3">
              <button onClick={() => handleStatusToggle(activePlan)}
                className="text-xs text-slate-400 hover:text-slate-600">Mark Complete</button>
            </div>
          </div>

          {/* Upcoming workouts for active plan */}
          {upcomingWorkouts.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Upcoming ({upcomingWorkouts.length})</h3>
              <div className="grid gap-2">
                {upcomingWorkouts.map(w => (
                  <Link key={w.id} href="/fitness/log"
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/60 px-4 py-3 shadow-sm hover:bg-white/80 transition-colors">
                    <span className="text-xs font-mono text-slate-400 w-24 shrink-0">{w.scheduled_date}</span>
                    <span className="text-sm font-medium text-slate-700">{w.day_label ?? w.workout_type ?? 'Workout'}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All plans */}
      {plans.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">All Plans ({plans.length})</h2>
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
            {plans.map(plan => (
              <div key={plan.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{plan.name}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[plan.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {plan.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {plan.start_date} → {plan.end_date}
                    {plan.plan_type ? ` · ${plan.plan_type}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {plan.status !== 'active' && (
                    <button onClick={() => handleStatusToggle(plan)}
                      className="text-xs text-blue-500 hover:text-blue-700">Activate</button>
                  )}
                  {plan.status === 'active' && (
                    <button onClick={() => handleStatusToggle(plan)}
                      className="text-xs text-slate-400 hover:text-slate-600">Complete</button>
                  )}
                  {confirmDeleteId === plan.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(plan.id)} className="text-xs text-red-600 font-medium">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(plan.id)}
                      className="text-xs text-slate-300 hover:text-red-400">Del</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {plans.length === 0 && !showCreate && (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">No training plans yet. Create your first plan to organize your training blocks.</p>
        </div>
      )}
    </div>
  );
}
