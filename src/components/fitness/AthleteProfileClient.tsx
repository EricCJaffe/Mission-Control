'use client';

import { useState } from 'react';

type Profile = {
  max_hr_ceiling: number;
  lactate_threshold_hr: number;
  ftp_watts: number | null;
  hr_zones: { z1: [number, number]; z2: [number, number]; z3: [number, number]; z4: [number, number] };
  power_zones: Record<string, [number, number]> | null;
  sleep_target_min: number;
  beta_blocker_multiplier: number;
  medications: { name: string; dose: string; frequency: string }[];
  meds_schedule: Record<string, string> | null;
  rhr_baseline: number | null;
  hrv_baseline: number | null;
  weight_goal_lbs: number | null;
  rhr_goal: number | null;
};

export default function AthleteProfileClient({ profile }: { profile: Profile | null }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [maxHr, setMaxHr] = useState(profile?.max_hr_ceiling ?? 155);
  const [lthr, setLthr] = useState(profile?.lactate_threshold_hr ?? 140);
  const [ftp, setFtp] = useState(profile?.ftp_watts ?? '');
  const [sleepTarget, setSleepTarget] = useState((profile?.sleep_target_min ?? 450) / 60);
  const [betaMultiplier, setBetaMultiplier] = useState(profile?.beta_blocker_multiplier ?? 1.15);
  const [rhrBaseline, setRhrBaseline] = useState(profile?.rhr_baseline ?? '');
  const [hrvBaseline, setHrvBaseline] = useState(profile?.hrv_baseline ?? '');
  const [weightGoal, setWeightGoal] = useState(profile?.weight_goal_lbs ?? '');
  const [rhrGoal, setRhrGoal] = useState(profile?.rhr_goal ?? '');
  const [medsSchedule, setMedsSchedule] = useState(
    profile?.meds_schedule
      ? JSON.stringify(profile.meds_schedule, null, 2)
      : '{\n  "morning": "6:00 AM",\n  "evening": "6:00 PM"\n}'
  );

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    let parsedSchedule = null;
    try { parsedSchedule = JSON.parse(medsSchedule); } catch { /* keep null */ }

    const res = await fetch('/api/fitness/athlete-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_hr_ceiling: maxHr,
        lactate_threshold_hr: lthr,
        ftp_watts: ftp ? Number(ftp) : null,
        sleep_target_min: Math.round(sleepTarget * 60),
        beta_blocker_multiplier: betaMultiplier,
        rhr_baseline: rhrBaseline ? Number(rhrBaseline) : null,
        hrv_baseline: hrvBaseline ? Number(hrvBaseline) : null,
        weight_goal_lbs: weightGoal ? Number(weightGoal) : null,
        rhr_goal: rhrGoal ? Number(rhrGoal) : null,
        meds_schedule: parsedSchedule,
      }),
    });

    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Cardiac Settings */}
      <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Cardiac Settings</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max HR Ceiling" value={maxHr} onChange={v => setMaxHr(Number(v) || 155)} type="number" unit="bpm" />
          <Field label="Lactate Threshold HR" value={lthr} onChange={v => setLthr(Number(v) || 140)} type="number" unit="bpm" />
          <Field label="Beta-Blocker Multiplier" value={betaMultiplier} onChange={v => setBetaMultiplier(Number(v) || 1.15)} type="number" step="0.05" />
        </div>
        <div className="text-xs text-slate-400">
          HR Zones (auto-calculated): Z1 {profile?.hr_zones?.z1?.[0] ?? 100}–{profile?.hr_zones?.z1?.[1] ?? 115}, Z2 {profile?.hr_zones?.z2?.[0] ?? 115}–{profile?.hr_zones?.z2?.[1] ?? 133}, Z3 {profile?.hr_zones?.z3?.[0] ?? 133}–{profile?.hr_zones?.z3?.[1] ?? 145}, Z4 {profile?.hr_zones?.z4?.[0] ?? 145}–{maxHr}
        </div>
      </section>

      {/* Cycling */}
      <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Cycling</h2>
        <Field label="FTP (Functional Threshold Power)" value={ftp} onChange={setFtp} type="number" unit="watts" placeholder="e.g., 200" />
        {profile?.power_zones && (
          <div className="text-xs text-slate-400">
            Power Zones: Z1 0–{(profile.power_zones as Record<string, [number, number]>).z1?.[1] ?? ''}W, Z2 {(profile.power_zones as Record<string, [number, number]>).z2?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z2?.[1] ?? ''}W, Z3 {(profile.power_zones as Record<string, [number, number]>).z3?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z3?.[1] ?? ''}W, Z4 {(profile.power_zones as Record<string, [number, number]>).z4?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z4?.[1] ?? ''}W
          </div>
        )}
      </section>

      {/* Baselines & Goals */}
      <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Baselines & Goals</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="RHR Baseline" value={rhrBaseline} onChange={setRhrBaseline} type="number" unit="bpm" placeholder="e.g., 72" />
          <Field label="HRV Baseline" value={hrvBaseline} onChange={setHrvBaseline} type="number" unit="ms" placeholder="e.g., 35" />
          <Field label="Weight Goal" value={weightGoal} onChange={setWeightGoal} type="number" unit="lbs" placeholder="e.g., 175" />
          <Field label="RHR Goal" value={rhrGoal} onChange={setRhrGoal} type="number" unit="bpm" placeholder="e.g., 65" />
        </div>
      </section>

      {/* Sleep & Medication */}
      <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sleep & Medication</h2>
        <Field label="Sleep Target" value={sleepTarget} onChange={v => setSleepTarget(Number(v) || 7.5)} type="number" step="0.5" unit="hours" />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Medication Schedule (JSON)</label>
          <textarea value={medsSchedule} onChange={e => setMedsSchedule(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
        </div>
      </section>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', unit, step, placeholder }: {
  label: string;
  value: string | number;
  onChange: (v: string | number) => void;
  type?: string;
  unit?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label} {unit && <span className="text-slate-400">({unit})</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
        step={step}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
      />
    </div>
  );
}
