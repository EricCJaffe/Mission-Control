'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, Snowflake, Hand, Footprints, Waves, Check, Loader2, Plus, X } from 'lucide-react';

const MODALITIES = [
  { value: 'sauna', label: 'Sauna', Icon: Flame },
  { value: 'cold_plunge', label: 'Cold Plunge', Icon: Snowflake },
  { value: 'massage', label: 'Massage', Icon: Hand },
  { value: 'compression', label: 'Compression', Icon: Footprints },
  { value: 'mobility', label: 'Mobility', Icon: Waves },
] as const;

/**
 * Modalities where temperature is the point.
 *
 * A 15-minute sauna at 160F and one at 195F are different sessions, and the
 * quick log had no way to say which — the full recovery page has the field but
 * this is where it actually gets logged. Massage and compression have no
 * temperature to record, so the input only appears where it means something.
 */
const TEMPERATURE_MODALITIES = new Set(['sauna', 'cold_plunge']);

/** Sensible starting points, so the field is one tap rather than typing. */
const TEMP_PRESETS: Record<string, number[]> = {
  sauna: [150, 165, 180, 195],
  cold_plunge: [38, 45, 50, 55],
};

const MASSAGE_SUBTYPES = [
  { value: 'gun', label: 'Gun' },
  { value: 'professional', label: 'Professional' },
  { value: 'self', label: 'Self' },
] as const;

/** One-tap recovery logging — modality, minutes, save. No navigation required. */
export default function QuickRecoveryLog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modality, setModality] = useState<string>('sauna');
  const [subType, setSubType] = useState('');
  const [minutes, setMinutes] = useState('');
  const [temperature, setTemperature] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const duration = Number(minutes);
    if (!duration || duration < 1) {
      setError('Enter minutes');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_date: new Date().toISOString().slice(0, 10),
          modality,
          sub_type: modality === 'massage' ? subType : '',
          duration_min: duration,
          temperature_f: TEMPERATURE_MODALITIES.has(modality) && temperature ? Number(temperature) : null,
          timing_context: 'standalone',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setMinutes('');
        setSubType('');
        setTemperature('');
        router.refresh();
        setTimeout(() => {
          setSaved(false);
          setOpen(false);
        }, 1400);
      } else {
        setError(data.error || 'Could not save');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400"
      >
        <Plus className="h-4 w-4 text-teal-600" />
        Log Recovery
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Log Recovery</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODALITIES.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setModality(value)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-medium ${
              modality === value
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {modality === 'massage' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {MASSAGE_SUBTYPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSubType(s.value)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium ${
                subType === s.value
                  ? 'border-teal-400 bg-teal-50 text-teal-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {TEMPERATURE_MODALITIES.has(modality) && (
        <div className="mt-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Temperature (&deg;F)
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {(TEMP_PRESETS[modality] ?? []).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTemperature(String(t))}
                className={`min-h-[36px] rounded-lg border-2 px-2.5 text-sm font-semibold ${
                  temperature === String(t)
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t}&deg;
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="&deg;F"
              aria-label="Temperature in Fahrenheit"
              className="min-h-[36px] w-20 rounded-lg border-2 border-slate-200 px-2 text-center text-sm font-semibold focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          className="min-h-[44px] w-24 rounded-xl border border-slate-200 px-3 text-center text-base font-semibold focus:border-teal-500 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving || saved}
          className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white ${
            saved ? 'bg-teal-500' : 'bg-teal-600 hover:bg-teal-700'
          } disabled:opacity-60`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="h-4 w-4" /> Logged
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
