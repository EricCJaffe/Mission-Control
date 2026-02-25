'use client';

import { useState } from 'react';
import { bpFlagLabel, bpFlagTailwindClass } from '@/lib/fitness/alerts';
import type { BPReading, BPFlagLevel } from '@/lib/fitness/types';

type Props = {
  readings: BPReading[];
};

export default function BPDashboardClient({ readings }: Props) {
  const [showForm, setShowForm] = useState(readings.length === 0);

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

  return (
    <div className="space-y-6">
      {/* Crisis alert */}
      {crisisReading && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4">
          <p className="font-semibold text-red-800">🚨 Recent Hypertensive Crisis Reading</p>
          <p className="text-sm text-red-700 mt-1">
            {crisisReading.systolic}/{crisisReading.diastolic} recorded on{' '}
            {new Date(crisisReading.reading_date).toLocaleDateString()}. If symptomatic, seek immediate care.
          </p>
        </div>
      )}

      {/* Latest + averages row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {latest && (
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Latest Reading</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{latest.systolic}/{latest.diastolic}</p>
            <p className="text-xs text-slate-500">{latest.pulse ? `${latest.pulse} bpm · ` : ''}{new Date(latest.reading_date).toLocaleDateString()}</p>
            <span className={`mt-2 inline-block text-xs font-medium rounded-full px-2 py-0.5 border ${bpFlagTailwindClass(latest.flag_level)}`}>
              {bpFlagLabel(latest.flag_level)}
            </span>
          </div>
        )}
        {avgSystolic != null && (
          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">30-Day Average</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{avgSystolic}/{avgDiastolic}</p>
            <p className="text-xs text-slate-500">{recent30.length} readings</p>
          </div>
        )}
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">AHA Targets</p>
          <p className="text-sm font-semibold text-green-700">&lt;120/80 Normal</p>
          <p className="text-xs text-slate-400 mt-1">120-129/&lt;80 Elevated</p>
          <p className="text-xs text-slate-400">130-139/80-89 Stage 1</p>
          <p className="text-xs text-slate-400">≥140/≥90 Stage 2</p>
        </div>
      </div>

      {/* New reading form */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
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
          <form action="/fitness/bp/new" method="post" className="space-y-3">
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Systolic</label>
                <input
                  name="systolic"
                  type="number"
                  required
                  min="60"
                  max="250"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xl font-bold w-24 text-center"
                  placeholder="120"
                />
              </div>
              <span className="text-2xl text-slate-400 mb-2">/</span>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Diastolic</label>
                <input
                  name="diastolic"
                  type="number"
                  required
                  min="40"
                  max="150"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xl font-bold w-24 text-center"
                  placeholder="80"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Pulse</label>
                <input
                  name="pulse"
                  type="number"
                  min="30"
                  max="200"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-lg font-bold w-20 text-center"
                  placeholder="72"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Position</label>
                <select name="position" className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="seated">Seated</option>
                  <option value="standing">Standing</option>
                  <option value="lying">Lying</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Arm</label>
                <select name="arm" className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Meds</label>
                <select name="pre_or_post_meds" className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="">—</option>
                  <option value="pre_meds">Pre-meds</option>
                  <option value="post_meds">Post-meds</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Workout</label>
                <select name="pre_or_post_workout" className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full">
                  <option value="">—</option>
                  <option value="pre_workout">Pre-workout</option>
                  <option value="post_workout">Post-workout</option>
                  <option value="rest_day">Rest day</option>
                </select>
              </div>
            </div>

            <input
              name="notes"
              placeholder="Notes (optional)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full"
            />

            <button
              type="submit"
              className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 min-h-[44px]"
            >
              Save Reading
            </button>
          </form>
        )}
      </div>

      {/* Readings log */}
      {readings.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Reading History</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {readings.slice(0, 30).map((r) => (
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
