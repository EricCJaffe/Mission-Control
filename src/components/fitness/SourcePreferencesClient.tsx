'use client';

import { useEffect, useState } from 'react';
import { Settings2, Save, CheckCircle2 } from 'lucide-react';

type Preferences = {
  sleep_source: string;
  daily_summary_source: string;
  body_metrics_source: string;
  resting_hr_source: string;
  hrv_source: string;
};

const SOURCE_OPTIONS = ['any', 'Garmin', 'Apple Health', 'Withings'];

const PREF_LABELS: Record<keyof Preferences, { label: string; description: string }> = {
  sleep_source: {
    label: 'Sleep',
    description: 'Sleep stages, duration, and quality data',
  },
  daily_summary_source: {
    label: 'Daily Activity',
    description: 'Steps, distance, calories, floors climbed',
  },
  body_metrics_source: {
    label: 'Body Metrics',
    description: 'Weight, body composition (usually Withings)',
  },
  resting_hr_source: {
    label: 'Resting Heart Rate',
    description: 'Daily resting HR measurement',
  },
  hrv_source: {
    label: 'HRV',
    description: 'Heart rate variability readings',
  },
};

export default function SourcePreferencesClient() {
  const [preferences, setPreferences] = useState<Preferences>({
    sleep_source: 'any',
    daily_summary_source: 'any',
    body_metrics_source: 'any',
    resting_hr_source: 'any',
    hrv_source: 'any',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPreferences();
  }, []);

  async function loadPreferences() {
    setLoading(true);
    try {
      const res = await fetch('/api/fitness/source-preferences', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreferences(data.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/fitness/source-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreferences(data.preferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  function updatePref(key: keyof Preferences, value: string) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading preferences…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-slate-700" />
            <h2 className="text-lg font-semibold">Source Preferences</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Choose which device is your preferred source for each data category.
            Set to <strong>&quot;any&quot;</strong> to accept from all devices, or pick a
            specific device to use as the source of truth.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Workouts</strong> are always accepted from any source. Since you
        only wear one device per activity, there&apos;s no duplication risk. The
        import will also skip any workout that overlaps in time with an existing
        one.
      </div>

      <div className="mt-6 space-y-4">
        {(Object.keys(PREF_LABELS) as (keyof Preferences)[]).map((key) => (
          <div key={key} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium text-slate-800">{PREF_LABELS[key].label}</p>
                <p className="text-sm text-slate-500">{PREF_LABELS[key].description}</p>
              </div>
              <select
                value={preferences[key]}
                onChange={(e) => updatePref(key, e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'any' ? 'Any (accept all)' : opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
