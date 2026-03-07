'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, Droplets, Loader2, Sparkles } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type HydrationLog = {
  id: string;
  log_date: string;
  intake_oz: number;
  output_oz: number;
  net_balance_oz: number;
  workout_minutes: number;
  sweat_level: string;
  sodium_mg: number | null;
  symptoms: string[];
  notes: string | null;
};

type HydrationTarget = {
  base_target_oz: number;
  min_target_oz: number;
  max_target_oz: number;
  workout_adjustment_per_hour_oz: number;
  heat_adjustment_oz: number;
  alert_weight_gain_lbs: number;
  reminder_enabled: boolean;
  reminder_time?: string | null;
  reminder_message?: string | null;
  notes: string | null;
} | null;

type Props = {
  initialLogs: HydrationLog[];
  initialTarget: HydrationTarget;
  recentMetrics: Array<{ metric_date: string; weight_lbs: number | null; resting_hr: number | null; hydration_lbs?: number | null }>;
};

export default function HydrationClient({ initialLogs, initialTarget, recentMetrics }: Props) {
  const router = useRouter();
  const [logs] = useState(initialLogs);
  const [target, setTarget] = useState<HydrationTarget>(initialTarget);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insights, setInsights] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState({
    base_target_oz: String(initialTarget?.base_target_oz || 96),
    min_target_oz: String(initialTarget?.min_target_oz || 85),
    max_target_oz: String(initialTarget?.max_target_oz || 128),
    workout_adjustment_per_hour_oz: String(initialTarget?.workout_adjustment_per_hour_oz || 24),
    heat_adjustment_oz: String(initialTarget?.heat_adjustment_oz || 12),
    alert_weight_gain_lbs: String(initialTarget?.alert_weight_gain_lbs || 2),
    reminder_time: initialTarget?.reminder_time || '15:00',
    reminder_message: initialTarget?.reminder_message || 'Hydration check: stay steady and symptom-aware.',
  });
  const [logForm, setLogForm] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    intake_oz: '',
    output_oz: '',
    workout_minutes: '',
    sweat_level: 'moderate',
    sodium_mg: '',
    symptoms: '',
    notes: '',
  });

  const todaySummary = useMemo(() => {
    const today = logs.find((log) => log.log_date === new Date().toISOString().slice(0, 10));
    return {
      intake: today?.intake_oz || 0,
      output: today?.output_oz || 0,
      net: today?.net_balance_oz || 0,
      target: target?.base_target_oz || 96,
    };
  }, [logs, target]);

  const chartData = useMemo(() => logs.slice().reverse().map((log) => ({
    date: log.log_date.slice(5),
    intake: Number(log.intake_oz || 0),
    output: Number(log.output_oz || 0),
    net: Number(log.net_balance_oz || 0),
  })), [logs]);

  async function saveTarget() {
    setSavingTarget(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/hydration/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save hydration target');
      setTarget(data.target);
      setMessage('Hydration targets updated.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hydration target');
    } finally {
      setSavingTarget(false);
    }
  }

  async function saveLog() {
    setSavingLog(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/fitness/hydration/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...logForm,
          symptoms: logForm.symptoms.split(',').map((item) => item.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save hydration log');
      setMessage(`Hydration log saved. Recommended target: ${data.recommended_target_oz || target?.base_target_oz || 96} oz.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hydration log');
    } finally {
      setSavingLog(false);
    }
  }

  async function loadInsights() {
    setLoadingInsights(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/hydration/insights');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load hydration insights');
      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hydration insights');
    } finally {
      setLoadingInsights(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Today Intake" value={`${todaySummary.intake} oz`} icon={<Droplets className="h-4 w-4" />} />
        <StatCard label="Today Output" value={`${todaySummary.output} oz`} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Net Balance" value={`${todaySummary.net} oz`} icon={<Droplets className="h-4 w-4" />} />
        <StatCard label="Base Target" value={`${todaySummary.target} oz`} icon={<Sparkles className="h-4 w-4" />} />
      </section>

      {insights?.computed ? (
        <section className="grid gap-4 md:grid-cols-2">
          <AlertCard
            title="Dehydration Risk"
            tone={Boolean((insights.computed as Record<string, unknown>).dehydrationRisk) ? 'warning' : 'neutral'}
            body={Boolean((insights.computed as Record<string, unknown>).dehydrationRisk)
              ? `You are materially below target with a weak net balance profile.`
              : 'No major dehydration pattern detected from the latest data.'}
          />
          <AlertCard
            title="Fluid Overload Risk"
            tone={Boolean((insights.computed as Record<string, unknown>).overloadRisk) ? 'critical' : 'neutral'}
            body={Boolean((insights.computed as Record<string, unknown>).overloadRisk)
              ? `Weight gain plus positive balance suggests overload risk.`
              : 'No strong overload pattern detected from the latest data.'}
          />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Hydration Targets</h2>
          <p className="mt-1 text-sm text-slate-500">85-128 oz/day with activity-based adjustments and HF weight-gain alerts.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ['Base target (oz)', 'base_target_oz'],
              ['Minimum (oz)', 'min_target_oz'],
              ['Maximum (oz)', 'max_target_oz'],
              ['Workout adj/hr (oz)', 'workout_adjustment_per_hour_oz'],
              ['Heat adj (oz)', 'heat_adjustment_oz'],
              ['Weight alert (lbs)', 'alert_weight_gain_lbs'],
              ['Reminder time', 'reminder_time'],
            ].map(([label, key]) => (
              <label key={key} className="block text-sm font-medium text-slate-700">
                {label}
                <input
                  value={targetForm[key as keyof typeof targetForm]}
                  type={key === 'reminder_time' ? 'time' : 'text'}
                  onChange={(event) => setTargetForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Reminder message
            <input
              value={targetForm.reminder_message}
              onChange={(event) => setTargetForm((prev) => ({ ...prev, reminder_message: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={saveTarget}
            disabled={savingTarget}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingTarget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
            Save Targets
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Daily Log</h2>
          <p className="mt-1 text-sm text-slate-500">Track intake, output, sweat loss, symptoms, and electrolyte usage.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Date" value={logForm.log_date} onChange={(value) => setLogForm((prev) => ({ ...prev, log_date: value }))} type="date" />
            <Field label="Intake (oz)" value={logForm.intake_oz} onChange={(value) => setLogForm((prev) => ({ ...prev, intake_oz: value }))} />
            <Field label="Output (oz)" value={logForm.output_oz} onChange={(value) => setLogForm((prev) => ({ ...prev, output_oz: value }))} />
            <Field label="Workout minutes" value={logForm.workout_minutes} onChange={(value) => setLogForm((prev) => ({ ...prev, workout_minutes: value }))} />
            <label className="block text-sm font-medium text-slate-700">
              Sweat level
              <select value={logForm.sweat_level} onChange={(event) => setLogForm((prev) => ({ ...prev, sweat_level: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>
            <Field label="Electrolyte sodium (mg)" value={logForm.sodium_mg} onChange={(value) => setLogForm((prev) => ({ ...prev, sodium_mg: value }))} />
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Symptoms (comma-separated)
            <input value={logForm.symptoms} onChange={(event) => setLogForm((prev) => ({ ...prev, symptoms: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="dizziness, thirst, edema" />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Notes
            <textarea value={logForm.notes} onChange={(event) => setLogForm((prev) => ({ ...prev, notes: event.target.value }))} className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <button
            type="button"
            onClick={saveLog}
            disabled={savingLog}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingLog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
            Save Daily Hydration
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">AI Hydration Insights</h2>
            <p className="mt-1 text-sm text-slate-500">Trend analysis tied to workouts, creatinine/eGFR context, and HF warning signals.</p>
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
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <InsightBlock title="Summary" content={String(insights.summary || 'No summary returned.')} />
            <InsightList title="Alerts" items={asStrings(insights.alerts)} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
            <InsightBlock title="Electrolytes" content={String(insights.electrolyte_suggestion || 'No electrolyte guidance yet.')} />
            <InsightList title="Reminders" items={asStrings(insights.reminders)} />
            <InsightList title="Education" items={asStrings(insights.education)} />
            <InsightList title="Trend Calls" items={asStrings(insights.trend_calls)} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Run the analysis to get hydration-specific AI guidance.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Hydration Trend</h2>
          <p className="mt-1 text-sm text-slate-500">Intake, output, and net balance over recent logs.</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Line type="monotone" dataKey="intake" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="output" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Recent Logs</h2>
          <div className="mt-4 space-y-3">
            {logs.slice(0, 7).map((log) => (
              <div key={log.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{log.log_date}</p>
                  <p className="text-xs text-slate-500">Net {log.net_balance_oz} oz</p>
                </div>
                <p className="mt-1 text-sm text-slate-700">Intake {log.intake_oz} oz · Output {log.output_oz} oz · Sweat {log.sweat_level}</p>
                {log.symptoms?.length ? <p className="mt-2 text-xs text-slate-500">Symptoms: {log.symptoms.join(', ')}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Vitals Context</h2>
          <div className="mt-4 space-y-3">
            {recentMetrics.slice(0, 5).map((metric) => (
              <div key={metric.metric_date} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{metric.metric_date}</p>
                <p className="mt-1">Weight: {metric.weight_lbs ?? '—'} lb · RHR: {metric.resting_hr ?? '—'} bpm</p>
                {metric.hydration_lbs != null ? <p className="text-xs text-slate-500">Scale hydration: {metric.hydration_lbs} lb</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
    </label>
  );
}

function InsightBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{content}</p>
    </div>
  );
}

function InsightList({ title, items, icon }: { title: string; items: string[]; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function AlertCard({ title, body, tone }: { title: string; body: string; tone: 'neutral' | 'warning' | 'critical' }) {
  const className =
    tone === 'critical'
      ? 'border-red-200 bg-red-50 text-red-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-white text-slate-700';

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${className}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm">{body}</p>
    </div>
  );
}
