import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BodyMetricsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { data: todayMetrics } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', user.id)
    .eq('metric_date', today)
    .maybeSingle();

  const { data: recentMetrics } = await supabase
    .from('body_metrics')
    .select('metric_date, weight_lbs, resting_hr, hrv_ms, body_battery, sleep_score, body_fat_pct')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: false })
    .limit(14);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Body Metrics</h1>
          <p className="mt-1 text-sm text-slate-500">Daily tracking — weight, cardiac, sleep, readiness.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>

      {/* Entry form — upserts for today's date */}
      <form action="/fitness/metrics/new" method="post" className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {todayMetrics ? 'Update Today\'s Metrics' : 'Log Today\'s Metrics'}
        </h2>
        <input type="hidden" name="metric_date" value={today} />

        <div className="grid gap-4 md:grid-cols-2">
          {/* Weight & Body Comp */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Weight & Body Composition</legend>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Weight (lbs)</label>
              <input
                name="weight_lbs"
                type="number"
                step="0.1"
                defaultValue={todayMetrics?.weight_lbs ?? ''}
                placeholder="184.0"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Body Fat %</label>
              <input
                name="body_fat_pct"
                type="number"
                step="0.1"
                defaultValue={todayMetrics?.body_fat_pct ?? ''}
                placeholder="22.5"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Muscle Mass (lbs)</label>
              <input
                name="muscle_mass_lbs"
                type="number"
                step="0.1"
                defaultValue={todayMetrics?.muscle_mass_lbs ?? ''}
                placeholder=""
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
          </fieldset>

          {/* Cardiac & Readiness */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Cardiac & Readiness</legend>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Resting HR (bpm)</label>
              <input
                name="resting_hr"
                type="number"
                defaultValue={todayMetrics?.resting_hr ?? ''}
                placeholder="65"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">HRV (ms)</label>
              <input
                name="hrv_ms"
                type="number"
                defaultValue={todayMetrics?.hrv_ms ?? ''}
                placeholder="42"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Body Battery (0-100)</label>
              <input
                name="body_battery"
                type="number"
                min="0"
                max="100"
                defaultValue={todayMetrics?.body_battery ?? ''}
                placeholder="65"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Sleep Score (0-100)</label>
              <input
                name="sleep_score"
                type="number"
                min="0"
                max="100"
                defaultValue={todayMetrics?.sleep_score ?? ''}
                placeholder="78"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Sleep Duration (hours)</label>
              <input
                name="sleep_duration_hours"
                type="number"
                step="0.25"
                defaultValue={todayMetrics?.sleep_duration_min ? (todayMetrics.sleep_duration_min / 60).toFixed(2) : ''}
                placeholder="7.5"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Stress Avg (Garmin)</label>
              <input
                name="stress_avg"
                type="number"
                defaultValue={todayMetrics?.stress_avg ?? ''}
                placeholder="28"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Meds Taken At</label>
              <input
                name="meds_taken_at"
                type="time"
                defaultValue={todayMetrics?.meds_taken_at ? todayMetrics.meds_taken_at.slice(0, 5) : ''}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
              />
            </div>
          </fieldset>
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-500 block mb-1">Notes</label>
          <input
            name="notes"
            defaultValue={todayMetrics?.notes ?? ''}
            placeholder="How are you feeling today?"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full"
          />
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-800 text-white text-sm font-medium px-6 py-2.5 hover:bg-slate-700 min-h-[44px]"
        >
          {todayMetrics ? 'Update Metrics' : 'Save Metrics'}
        </button>
      </form>

      {/* Recent history */}
      {recentMetrics && recentMetrics.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Recent History (14 days)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Weight</th>
                  <th className="px-4 py-2 text-right font-medium">RHR</th>
                  <th className="px-4 py-2 text-right font-medium">HRV</th>
                  <th className="px-4 py-2 text-right font-medium">Battery</th>
                  <th className="px-4 py-2 text-right font-medium">Sleep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentMetrics.map((m) => (
                  <tr key={m.metric_date}>
                    <td className="px-4 py-2 text-slate-600 font-mono text-xs">
                      {new Date(m.metric_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.weight_lbs ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.resting_hr ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.hrv_ms ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.body_battery ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.sleep_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
