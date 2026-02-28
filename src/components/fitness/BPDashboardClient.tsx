'use client';

import { useState, useMemo } from 'react';
import { bpFlagLabel, bpFlagTailwindClass } from '@/lib/fitness/alerts';
import type { BPFlagLevel } from '@/lib/fitness/types';
import DateRangeFilter, { type DateRange, getDefaultRange } from './DateRangeFilter';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

type BPRow = {
  id: string;
  reading_date: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  flag_level: BPFlagLevel;
  position: string;
  arm: string;
  time_of_day: string | null;
  pre_or_post_meds: string | null;
  pre_or_post_workout: string | null;
  notes: string | null;
};

type Props = {
  readings: BPRow[];
};

export default function BPDashboardClient({ readings: initial }: Props) {
  const [readings, setReadings] = useState(initial);
  const [showForm, setShowForm] = useState(initial.length === 0);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange('bp-range'));

  async function handleDateRangeChange(range: DateRange) {
    setDateRange(range);
    try {
      const params = new URLSearchParams();
      if (range.preset !== 'all') {
        params.set('start', new Date(range.startDate).toISOString());
        params.set('end', new Date(range.endDate + 'T23:59:59').toISOString());
      }
      const res = await fetch(`/api/fitness/bp?${params}`);
      const data = await res.json();
      if (data.ok) setReadings(data.readings);
    } catch {
      setError('Failed to load readings for selected range');
    }
  }

  // Form state
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [position, setPosition] = useState('seated');
  const [arm, setArm] = useState('left');
  const [prePostMeds, setPrePostMeds] = useState('');
  const [prePostWorkout, setPrePostWorkout] = useState('');
  const [bpNotes, setBpNotes] = useState('');

  async function handleAdd() {
    if (!systolic || !diastolic) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/bp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          pulse: pulse ? parseInt(pulse) : null,
          position,
          arm,
          pre_or_post_meds: prePostMeds || null,
          pre_or_post_workout: prePostWorkout || null,
          notes: bpNotes || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setReadings(prev => [data.reading, ...prev]);
        setSystolic(''); setDiastolic(''); setPulse(''); setBpNotes('');
        setShowForm(false);
      } else {
        setError(data.error || 'Failed to save reading');
      }
    } catch {
      setError('Network error — could not save reading');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/bp?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setReadings(prev => prev.filter(r => r.id !== id));
        setConfirmDeleteId(null);
      } else {
        setError(data.error || 'Failed to delete reading');
      }
    } catch {
      setError('Network error — could not delete reading');
    }
  }

  const latest = readings[0];
  const crisisReading = readings.find((r) => r.flag_level === 'crisis');

  // Rolling 30-day averages
  const recent30 = readings.slice(0, 30);
  const avgSystolic = recent30.length
    ? Math.round(recent30.reduce((s, r) => s + r.systolic, 0) / recent30.length)
    : null;
  const avgDiastolic = recent30.length
    ? Math.round(recent30.reduce((s, r) => s + r.diastolic, 0) / recent30.length)
    : null;

  // Advanced stats
  const { chartData, stats, trends } = useMemo(() => {
    if (readings.length === 0) return { chartData: [], stats: null, trends: null };

    // Prepare chart data (reverse for chronological order)
    const reversed = [...readings].reverse();
    const data = reversed.map((r, idx) => {
      // Calculate moving averages
      const window7 = reversed.slice(Math.max(0, idx - 6), idx + 1);
      const window30 = reversed.slice(Math.max(0, idx - 29), idx + 1);

      return {
        date: new Date(r.reading_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: r.reading_date,
        systolic: r.systolic,
        diastolic: r.diastolic,
        pulse: r.pulse,
        systolic_7d: window7.length >= 3
          ? Math.round(window7.reduce((s, x) => s + x.systolic, 0) / window7.length)
          : null,
        diastolic_7d: window7.length >= 3
          ? Math.round(window7.reduce((s, x) => s + x.diastolic, 0) / window7.length)
          : null,
        systolic_30d: window30.length >= 7
          ? Math.round(window30.reduce((s, x) => s + x.systolic, 0) / window30.length)
          : null,
        diastolic_30d: window30.length >= 7
          ? Math.round(window30.reduce((s, x) => s + x.diastolic, 0) / window30.length)
          : null,
      };
    });

    // Calculate stats
    const allSystolic = readings.map(r => r.systolic);
    const allDiastolic = readings.map(r => r.diastolic);
    const allPulse = readings.filter(r => r.pulse).map(r => r.pulse!);

    const stats = {
      systolic: {
        avg: Math.round(allSystolic.reduce((a, b) => a + b, 0) / allSystolic.length),
        min: Math.min(...allSystolic),
        max: Math.max(...allSystolic),
      },
      diastolic: {
        avg: Math.round(allDiastolic.reduce((a, b) => a + b, 0) / allDiastolic.length),
        min: Math.min(...allDiastolic),
        max: Math.max(...allDiastolic),
      },
      pulse: allPulse.length > 0 ? {
        avg: Math.round(allPulse.reduce((a, b) => a + b, 0) / allPulse.length),
        min: Math.min(...allPulse),
        max: Math.max(...allPulse),
      } : null,
      pulsePressure: latest ? latest.systolic - latest.diastolic : null,
      map: latest ? Math.round(latest.diastolic + (latest.systolic - latest.diastolic) / 3) : null,
    };

    // Calculate trends (compare recent 7 vs previous 7)
    const recent7 = readings.slice(0, 7);
    const prev7 = readings.slice(7, 14);

    let trends = null;
    if (recent7.length >= 3 && prev7.length >= 3) {
      const recentSysAvg = recent7.reduce((s, r) => s + r.systolic, 0) / recent7.length;
      const prevSysAvg = prev7.reduce((s, r) => s + r.systolic, 0) / prev7.length;
      const recentDiaAvg = recent7.reduce((s, r) => s + r.diastolic, 0) / recent7.length;
      const prevDiaAvg = prev7.reduce((s, r) => s + r.diastolic, 0) / prev7.length;

      const sysDiff = recentSysAvg - prevSysAvg;
      const diaDiff = recentDiaAvg - prevDiaAvg;

      trends = {
        systolic: Math.abs(sysDiff) < 2 ? 'stable' : sysDiff > 0 ? 'up' : 'down',
        diastolic: Math.abs(diaDiff) < 2 ? 'stable' : diaDiff > 0 ? 'up' : 'down',
        sysDiff: Math.round(sysDiff),
        diaDiff: Math.round(diaDiff),
      };
    }

    return { chartData: data, stats, trends };
  }, [readings]);

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Crisis alert */}
      {crisisReading && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4">
          <p className="font-semibold text-red-800 flex items-center gap-1.5"><AlertTriangle size={18} /> Recent Hypertensive Crisis Reading</p>
          <p className="text-sm text-red-700 mt-1">
            {crisisReading.systolic}/{crisisReading.diastolic} recorded on{' '}
            {new Date(crisisReading.reading_date).toLocaleDateString()}. If symptomatic, seek immediate care.
          </p>
        </div>
      )}

      {/* Date range filter */}
      <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} storageKey="bp-range" />

      {/* Latest + averages row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {latest && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Latest Reading</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{latest.systolic}/{latest.diastolic}</p>
            <p className="text-xs text-slate-500">{latest.pulse ? `${latest.pulse} bpm · ` : ''}{new Date(latest.reading_date).toLocaleDateString()}</p>
            <span className={`mt-2 inline-block text-xs font-medium rounded-full px-2 py-0.5 border ${bpFlagTailwindClass(latest.flag_level)}`}>
              {bpFlagLabel(latest.flag_level)}
            </span>
          </div>
        )}
        {avgSystolic != null && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">30-Day Average</p>
              {trends && (
                <div className="flex items-center gap-0.5">
                  {trends.systolic === 'up' ? (
                    <TrendingUp className="h-3 w-3 text-red-500" />
                  ) : trends.systolic === 'down' ? (
                    <TrendingDown className="h-3 w-3 text-green-500" />
                  ) : (
                    <Minus className="h-3 w-3 text-slate-400" />
                  )}
                </div>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{avgSystolic}/{avgDiastolic}</p>
            <p className="text-xs text-slate-500">{recent30.length} readings</p>
          </div>
        )}
        {stats?.pulsePressure != null && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Pulse Pressure</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.pulsePressure}</p>
            <p className="text-xs text-slate-400">SYS - DIA</p>
            <p className="text-xs text-slate-500 mt-1">Target: &lt;60</p>
          </div>
        )}
        {stats?.map != null && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Mean Arterial Pressure</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{stats.map}</p>
            <p className="text-xs text-slate-400">MAP</p>
            <p className="text-xs text-slate-500 mt-1">Target: 70-100</p>
          </div>
        )}
      </div>

      {/* Advanced Charts */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Blood Pressure Trends</h2>

          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <YAxis
                domain={[60, 180]}
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {/* Reference lines for AHA guidelines */}
              <ReferenceLine y={120} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Normal (120)', fontSize: 10, fill: '#10b981' }} />
              <ReferenceLine y={130} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Stage 1 (130)', fontSize: 10, fill: '#f59e0b' }} />
              <ReferenceLine y={140} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Stage 2 (140)', fontSize: 10, fill: '#ef4444' }} />
              <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" />

              {/* Actual readings */}
              <Line
                type="monotone"
                dataKey="systolic"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Systolic"
              />
              <Line
                type="monotone"
                dataKey="diastolic"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Diastolic"
              />

              {/* Moving averages */}
              <Line
                type="monotone"
                dataKey="systolic_7d"
                stroke="#fca5a5"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Systolic 7-day MA"
              />
              <Line
                type="monotone"
                dataKey="diastolic_7d"
                stroke="#93c5fd"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Diastolic 7-day MA"
              />
            </LineChart>
          </ResponsiveContainer>

          {trends && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Systolic Trend (7d)</span>
                  {trends.systolic === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-red-500" />
                  ) : trends.systolic === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <p className="text-sm font-semibold mt-1">
                  {trends.systolic === 'up' && `↑ ${trends.sysDiff} mmHg`}
                  {trends.systolic === 'down' && `↓ ${Math.abs(trends.sysDiff)} mmHg`}
                  {trends.systolic === 'stable' && 'Stable'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Diastolic Trend (7d)</span>
                  {trends.diastolic === 'up' ? (
                    <TrendingUp className="h-4 w-4 text-red-500" />
                  ) : trends.diastolic === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <p className="text-sm font-semibold mt-1">
                  {trends.diastolic === 'up' && `↑ ${trends.diaDiff} mmHg`}
                  {trends.diastolic === 'down' && `↓ ${Math.abs(trends.diaDiff)} mmHg`}
                  {trends.diastolic === 'stable' && 'Stable'}
                </p>
              </div>
            </div>
          )}

          {/* Stats summary */}
          {stats && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-xs text-red-600 font-medium">Systolic Range</p>
                <p className="text-sm font-bold text-red-700 mt-1">{stats.systolic.min} - {stats.systolic.max}</p>
                <p className="text-xs text-red-600">Avg: {stats.systolic.avg}</p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                <p className="text-xs text-blue-600 font-medium">Diastolic Range</p>
                <p className="text-sm font-bold text-blue-700 mt-1">{stats.diastolic.min} - {stats.diastolic.max}</p>
                <p className="text-xs text-blue-600">Avg: {stats.diastolic.avg}</p>
              </div>
              {stats.pulse && (
                <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                  <p className="text-xs text-purple-600 font-medium">Pulse Range</p>
                  <p className="text-sm font-bold text-purple-700 mt-1">{stats.pulse.min} - {stats.pulse.max} bpm</p>
                  <p className="text-xs text-purple-600">Avg: {stats.pulse.avg} bpm</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New reading form */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Log Blood Pressure</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showForm ? 'Hide' : 'Show form'}
          </button>
        </div>

        {showForm && (
          <div className="space-y-3">
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Systolic</label>
                <input
                  type="number"
                  value={systolic}
                  onChange={e => setSystolic(e.target.value)}
                  min={60}
                  max={250}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xl font-bold w-24 text-center"
                  placeholder="120"
                />
              </div>
              <span className="text-2xl text-slate-400 mb-2">/</span>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Diastolic</label>
                <input
                  type="number"
                  value={diastolic}
                  onChange={e => setDiastolic(e.target.value)}
                  min={40}
                  max={150}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xl font-bold w-24 text-center"
                  placeholder="80"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Pulse</label>
                <input
                  type="number"
                  value={pulse}
                  onChange={e => setPulse(e.target.value)}
                  min={30}
                  max={200}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-lg font-bold w-20 text-center"
                  placeholder="72"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Position</label>
                <select value={position} onChange={e => setPosition(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="seated">Seated</option>
                  <option value="standing">Standing</option>
                  <option value="lying">Lying</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Arm</label>
                <select value={arm} onChange={e => setArm(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Meds</label>
                <select value={prePostMeds} onChange={e => setPrePostMeds(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="">—</option>
                  <option value="pre_meds">Pre-meds</option>
                  <option value="post_meds">Post-meds</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Workout</label>
                <select value={prePostWorkout} onChange={e => setPrePostWorkout(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="">—</option>
                  <option value="pre_workout">Pre-workout</option>
                  <option value="post_workout">Post-workout</option>
                  <option value="rest_day">Rest day</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              value={bpNotes}
              onChange={e => setBpNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
            />

            <button
              onClick={handleAdd}
              disabled={saving || !systolic || !diastolic}
              className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving...' : 'Save Reading'}
            </button>
          </div>
        )}
      </div>

      {/* Reading History */}
      {readings.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Reading History ({readings.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {readings.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <span className="text-lg font-bold tabular-nums text-slate-800">{r.systolic}/{r.diastolic}</span>
                  {r.pulse && <span className="text-xs text-slate-400 ml-1">{r.pulse}</span>}
                </div>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 border shrink-0 ${bpFlagTailwindClass(r.flag_level)}`}>
                  {bpFlagLabel(r.flag_level)}
                </span>
                <div className="flex-1 text-xs text-slate-400 text-right">
                  {r.pre_or_post_meds ? `${r.pre_or_post_meds.replace('_', '-')} · ` : ''}
                  {new Date(r.reading_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
                <div className="shrink-0">
                  {confirmDeleteId === r.id ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-red-600 font-medium">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(r.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
