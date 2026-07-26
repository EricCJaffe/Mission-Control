'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Sun, Snowflake, Leaf, CloudSun } from 'lucide-react';

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

type GarminStatus = {
  connected: boolean;
  email: string | null;
  lastSync: string | null;
};

type SeasonalInfo = {
  base_max_hr: number;
  effective_max_hr: number;
  seasonal: { season: string; label: string; adjustment_bpm: number; reason: string };
  new_zones: { z1: [number, number]; z2: [number, number]; z3: [number, number]; z4: [number, number] };
  changed: boolean;
};

const SEASON_ICONS: Record<string, typeof Sun> = {
  summer: Sun,
  winter: Snowflake,
  spring: Leaf,
  fall: CloudSun,
};

const ZONE_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626'];
const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold'];

export default function AthleteProfileClient({ profile }: { profile: Profile | null }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [garminStatus, setGarminStatus] = useState<GarminStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [recalibratingHrZones, setRecalibratingHrZones] = useState(false);
  const [seasonalInfo, setSeasonalInfo] = useState<SeasonalInfo | null>(null);
  const [recalibratingZones, setRecalibratingZones] = useState(false);
  const [recalibrationResult, setRecalibrationResult] = useState<{
    season: string;
    sample_count: number;
    current_ftp: number | null;
    baseline_ftp_estimate: number;
    seasonal_adjusted_ftp: number;
  } | null>(null);

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

  useEffect(() => {
    fetchGarminStatus();
    fetchSeasonalInfo();
  }, []);

  // Read-only preview — GET never persists. Writing happens only via handleRecalibrateHrZones.
  async function fetchSeasonalInfo() {
    try {
      const res = await fetch('/api/fitness/athlete-profile/recalibrate-zones');
      if (res.ok) setSeasonalInfo(await res.json());
    } catch (error) {
      console.error('Failed to fetch seasonal HR info:', error);
    }
  }

  async function handleRecalibrateHrZones() {
    setRecalibratingHrZones(true);
    try {
      const res = await fetch('/api/fitness/athlete-profile/recalibrate-zones', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to recalibrate HR zones');
      setSeasonalInfo(data);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to recalibrate HR zones');
    } finally {
      setRecalibratingHrZones(false);
    }
  }

  async function fetchGarminStatus() {
    try {
      const res = await fetch('/api/fitness/garmin/status');
      const data = await res.json();
      setGarminStatus(data);
    } catch (error) {
      console.error('Failed to fetch Garmin status:', error);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const res = await fetch('/api/fitness/garmin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await res.json();
      alert(data.message || data.error);
      await fetchGarminStatus();
    } catch {
      alert('Network error - please try again');
    } finally {
      setSyncing(false);
    }
  }

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

  async function handleSeasonalRecalibrate() {
    setRecalibratingZones(true);
    try {
      const res = await fetch('/api/fitness/power-zones/recalibrate');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || data.error || 'Could not generate recalibration suggestion');
        return;
      }
      setRecalibrationResult(data);
      setFtp(data.seasonal_adjusted_ftp);
    } catch {
      alert('Network error while recalibrating');
    } finally {
      setRecalibratingZones(false);
    }
  }

  async function applySeasonalSuggestion() {
    if (!recalibrationResult) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/power-zones/recalibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ftp_watts: recalibrationResult.seasonal_adjusted_ftp }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply recalibration');
      }
      setSaved(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to apply recalibration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Cardiac Settings */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Cardiac Settings</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max HR Ceiling" value={maxHr} onChange={v => setMaxHr(Number(v) || 155)} type="number" unit="bpm" />
          <Field label="Lactate Threshold HR" value={lthr} onChange={v => setLthr(Number(v) || 140)} type="number" unit="bpm" />
          <Field label="Beta-Blocker Multiplier" value={betaMultiplier} onChange={v => setBetaMultiplier(Number(v) || 1.15)} type="number" step="0.05" />
        </div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">HR Zones (auto-calculated)</span>
            <button
              onClick={handleRecalibrateHrZones}
              disabled={recalibratingHrZones}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 min-h-[28px] disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${recalibratingHrZones ? 'animate-spin' : ''}`} />
              Recalibrate
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['z1', 'z2', 'z3', 'z4'] as const).map((z, i) => (
              <div key={z} className="rounded-lg p-2 text-center" style={{ backgroundColor: `${ZONE_COLORS[i]}10`, border: `1px solid ${ZONE_COLORS[i]}30` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: ZONE_COLORS[i] }}>
                  Z{i + 1} {ZONE_NAMES[i]}
                </div>
                <div className="text-sm font-bold text-slate-700 mt-0.5">
                  {profile?.hr_zones?.[z]?.[0] ?? '–'}–{profile?.hr_zones?.[z]?.[1] ?? '–'}
                </div>
                <div className="text-[10px] text-slate-400">bpm</div>
              </div>
            ))}
          </div>
          {seasonalInfo && (() => {
            const SeasonIcon = SEASON_ICONS[seasonalInfo.seasonal.season] || Sun;
            return (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                seasonalInfo.seasonal.adjustment_bpm < 0
                  ? 'bg-amber-50 border border-amber-200 text-amber-800'
                  : 'bg-slate-50 border border-slate-200 text-slate-600'
              }`}>
                <SeasonIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">
                    {seasonalInfo.seasonal.label}
                    {seasonalInfo.seasonal.adjustment_bpm !== 0 && (
                      <> · ceiling {seasonalInfo.seasonal.adjustment_bpm > 0 ? '+' : ''}{seasonalInfo.seasonal.adjustment_bpm} bpm → {seasonalInfo.effective_max_hr}</>
                    )}
                  </div>
                  <div className="mt-0.5 opacity-80">{seasonalInfo.seasonal.reason}</div>
                  {seasonalInfo.changed && (
                    <div className="mt-1 font-medium">Saved zones are out of date — tap Recalibrate to apply.</div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Cycling */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Cycling</h2>
        <Field label="FTP (Functional Threshold Power)" value={ftp} onChange={setFtp} type="number" unit="watts" placeholder="e.g., 200" />
        <button
          onClick={handleSeasonalRecalibrate}
          disabled={recalibratingZones}
          className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 disabled:opacity-50"
        >
          {recalibratingZones ? 'Analyzing 90-day cycling data...' : 'Seasonal Zone Recalibration'}
        </button>
        {recalibrationResult && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900 space-y-1">
            <p>
              Suggested FTP: <strong>{recalibrationResult.seasonal_adjusted_ftp}W</strong> ({recalibrationResult.season})
            </p>
            <p className="text-xs text-indigo-700">
              Baseline estimate: {recalibrationResult.baseline_ftp_estimate}W from {recalibrationResult.sample_count} qualifying rides.
            </p>
            <button
              onClick={applySeasonalSuggestion}
              disabled={saving}
              className="mt-2 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Apply Suggested FTP & Zones
            </button>
          </div>
        )}
        {profile?.power_zones && (
          <div className="text-xs text-slate-400">
            Power Zones: Z1 0–{(profile.power_zones as Record<string, [number, number]>).z1?.[1] ?? ''}W, Z2 {(profile.power_zones as Record<string, [number, number]>).z2?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z2?.[1] ?? ''}W, Z3 {(profile.power_zones as Record<string, [number, number]>).z3?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z3?.[1] ?? ''}W, Z4 {(profile.power_zones as Record<string, [number, number]>).z4?.[0] ?? ''}–{(profile.power_zones as Record<string, [number, number]>).z4?.[1] ?? ''}W
          </div>
        )}
      </section>

      {/* Baselines & Goals */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Baselines & Goals</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="RHR Baseline" value={rhrBaseline} onChange={setRhrBaseline} type="number" unit="bpm" placeholder="e.g., 72" />
          <Field label="HRV Baseline" value={hrvBaseline} onChange={setHrvBaseline} type="number" unit="ms" placeholder="e.g., 35" />
          <Field label="Weight Goal" value={weightGoal} onChange={setWeightGoal} type="number" unit="lbs" placeholder="e.g., 175" />
          <Field label="RHR Goal" value={rhrGoal} onChange={setRhrGoal} type="number" unit="bpm" placeholder="e.g., 65" />
        </div>
      </section>

      {/* Sleep & Medication */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sleep & Medication</h2>
        <Field label="Sleep Target" value={sleepTarget} onChange={v => setSleepTarget(Number(v) || 7.5)} type="number" step="0.5" unit="hours" />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Medication Schedule (JSON)</label>
          <textarea value={medsSchedule} onChange={e => setMedsSchedule(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
        </div>
      </section>

      {/* Garmin Connect */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Garmin Connect</h2>
        {garminStatus?.connected ? (
          <>
            <div className="text-sm text-slate-600">
              <p><strong>Status:</strong> Connected</p>
              <p><strong>Email:</strong> {garminStatus.email}</p>
              {garminStatus.lastSync && (
                <p className="text-xs text-slate-500 mt-1">
                  Last sync: {new Date(garminStatus.lastSync).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full min-h-[44px] rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Connect your Garmin account to automatically sync daily metrics (RHR, HRV, body battery, sleep) and workout activities.
            </p>
            <Link href="/fitness/settings/garmin">
              <button className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700">
                Connect Garmin
              </button>
            </Link>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-slate-500">or</span>
              </div>
            </div>
            <Link href="/fitness/settings/garmin/import">
              <button className="w-full min-h-[44px] rounded-xl border-2 border-blue-600 bg-white text-blue-600 font-semibold hover:bg-blue-50">
                Import FIT Files
              </button>
            </Link>
            <p className="text-xs text-slate-500">
              Manually upload FIT files exported from Garmin Connect
            </p>
          </div>
        )}
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
