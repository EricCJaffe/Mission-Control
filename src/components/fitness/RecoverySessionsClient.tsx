'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell, Loader2, Snowflake, Sparkles, StretchHorizontal, Waves, Flame } from 'lucide-react';
import { modalityLabel } from '@/lib/fitness/recovery-modalities';
import type { RecoverySession } from '@/lib/fitness/types';

type Props = {
  initialSessions: RecoverySession[];
  recentWorkouts: Array<{
    id: string;
    workout_date: string;
    workout_type: string;
    duration_minutes: number | null;
  }>;
};

const MODALITY_OPTIONS = [
  { value: 'sauna', label: 'Sauna', icon: Flame },
  { value: 'cold_plunge', label: 'Cold Plunge', icon: Snowflake },
  { value: 'stretching', label: 'Stretching', icon: StretchHorizontal },
  { value: 'mobility', label: 'Mobility', icon: Waves },
] as const;

export default function RecoverySessionsClient({ initialSessions, recentWorkouts }: Props) {
  const router = useRouter();
  const [sessions] = useState(initialSessions);
  const [saving, setSaving] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insights, setInsights] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    session_date: new Date().toISOString().slice(0, 10),
    modality: 'sauna',
    duration_min: '',
    temperature_f: '',
    rounds: '',
    timing_context: 'standalone',
    linked_workout_id: '',
    perceived_recovery: '',
    energy_before: '',
    energy_after: '',
    soreness_before: '',
    soreness_after: '',
    notes: '',
  });

  const weeklySummary = useMemo(() => {
    const last7 = sessions.slice(0, 7);
    return {
      total: last7.length,
      minutes: last7.reduce((sum, session) => sum + Number(session.duration_min || 0), 0),
      sauna: last7.filter((s) => s.modality === 'sauna').length,
      cold: last7.filter((s) => s.modality === 'cold_plunge').length,
      mobility: last7.filter((s) => s.modality === 'mobility' || s.modality === 'stretching').length,
    };
  }, [sessions]);

  async function saveSession() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save recovery session');
      setMessage(`${modalityLabel(form.modality as RecoverySession['modality'])} session logged.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recovery session');
    } finally {
      setSaving(false);
    }
  }

  async function loadInsights() {
    setLoadingInsights(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/recovery/insights');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load recovery insights');
      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recovery insights');
    } finally {
      setLoadingInsights(false);
    }
  }

  const selectedModality = MODALITY_OPTIONS.find((option) => option.value === form.modality);
  const ModalityIcon = selectedModality?.icon || Waves;

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Last 7 Sessions" value={String(weeklySummary.total)} />
        <StatCard label="Recovery Minutes" value={String(weeklySummary.minutes)} />
        <StatCard label="Heat / Cold" value={`${weeklySummary.sauna}/${weeklySummary.cold}`} />
        <StatCard label="Mobility Work" value={String(weeklySummary.mobility)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <ModalityIcon className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Log Recovery Session</h2>
              <p className="mt-1 text-sm text-slate-500">Use quick recovery logging without forcing it into the workout logger.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Date" value={form.session_date} onChange={(value) => setForm((prev) => ({ ...prev, session_date: value }))} type="date" />
            <label className="block text-sm font-medium text-slate-700">
              Modality
              <select value={form.modality} onChange={(event) => setForm((prev) => ({ ...prev, modality: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                {MODALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <Field label="Duration (min)" value={form.duration_min} onChange={(value) => setForm((prev) => ({ ...prev, duration_min: value }))} />
            <label className="block text-sm font-medium text-slate-700">
              Timing
              <select value={form.timing_context} onChange={(event) => setForm((prev) => ({ ...prev, timing_context: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                <option value="standalone">Standalone</option>
                <option value="pre_workout">Pre-workout</option>
                <option value="post_workout">Post-workout</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>
            <Field label={form.modality === 'cold_plunge' ? 'Temp (F)' : 'Temp (F, optional)'} value={form.temperature_f} onChange={(value) => setForm((prev) => ({ ...prev, temperature_f: value }))} />
            <Field label="Rounds" value={form.rounds} onChange={(value) => setForm((prev) => ({ ...prev, rounds: value }))} />
            <Field label="Energy before (1-10)" value={form.energy_before} onChange={(value) => setForm((prev) => ({ ...prev, energy_before: value }))} />
            <Field label="Energy after (1-10)" value={form.energy_after} onChange={(value) => setForm((prev) => ({ ...prev, energy_after: value }))} />
            <Field label="Soreness before (1-10)" value={form.soreness_before} onChange={(value) => setForm((prev) => ({ ...prev, soreness_before: value }))} />
            <Field label="Soreness after (1-10)" value={form.soreness_after} onChange={(value) => setForm((prev) => ({ ...prev, soreness_after: value }))} />
            <Field label="Perceived recovery (1-10)" value={form.perceived_recovery} onChange={(value) => setForm((prev) => ({ ...prev, perceived_recovery: value }))} />
            <label className="block text-sm font-medium text-slate-700">
              Linked workout
              <select value={form.linked_workout_id} onChange={(event) => setForm((prev) => ({ ...prev, linked_workout_id: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                <option value="">None</option>
                {recentWorkouts.map((workout) => (
                  <option key={workout.id} value={workout.id}>
                    {workout.workout_date.slice(0, 10)} · {workout.workout_type} · {workout.duration_minutes ?? '—'} min
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            Notes
            <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="How did it feel? Any BP, breathing, or recovery notes?" />
          </label>

          <button
            type="button"
            onClick={saveSession}
            disabled={saving}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Save Recovery Session
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Recovery Insights</h2>
              <p className="mt-1 text-sm text-slate-500">Look at recovery work in context with workouts and body metrics.</p>
            </div>
            <button
              type="button"
              onClick={loadInsights}
              disabled={loadingInsights}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Analyze
            </button>
          </div>

          {insights ? (
            <div className="mt-4 space-y-4">
              <Panel title="Summary" content={String(insights.summary || 'No summary returned.')} />
              <PanelList title="Priorities" items={asStrings(insights.priorities)} />
              <PanelList title="Warnings" items={asStrings(insights.warnings)} />
              <PanelList title="Modality Observations" items={asStrings(insights.modality_observations)} />
              <Panel title="Next Step" content={String(insights.next_step || 'No next step returned.')} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Run the analysis to see whether recovery work is supporting the larger program.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Recent Sessions</h2>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No recovery sessions logged yet.</p>
          ) : sessions.slice(0, 12).map((session) => (
            <div key={session.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{modalityLabel(session.modality)}</p>
                  <p className="text-xs text-slate-500">{session.session_date} · {session.timing_context.replace('_', ' ')}</p>
                </div>
                <p className="text-sm text-slate-700">{session.duration_min} min</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                {session.temperature_f != null ? <span>Temp {session.temperature_f} F</span> : null}
                {session.rounds != null ? <span>Rounds {session.rounds}</span> : null}
                {session.perceived_recovery != null ? <span>Recovery {session.perceived_recovery}/10</span> : null}
                {session.energy_before != null && session.energy_after != null ? <span>Energy {session.energy_before}→{session.energy_after}</span> : null}
                {session.soreness_before != null && session.soreness_after != null ? <span>Soreness {session.soreness_before}→{session.soreness_after}</span> : null}
              </div>
              {session.notes ? <p className="mt-2 text-sm text-slate-700">{session.notes}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-slate-600" />
          <h2 className="text-xl font-semibold text-slate-900">Program Notes</h2>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li>Use mobility and stretching here for fast recovery logging, even if longer mobility blocks still live in the workout module.</li>
          <li>Sauna and cold plunge should stay recovery-first, not performance theater. Track dose and response.</li>
          <li>These sessions are intended to feed morning briefing, readiness interpretation, and later command-center synthesis.</li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = 'number' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
    </label>
  );
}

function Panel({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{content}</p>
    </div>
  );
}

function PanelList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}
