'use client';

import { useState, useEffect } from 'react';

export type DateRangePreset = '7d' | '30d' | '60d' | '90d' | '180d' | '365d' | 'all' | 'custom';

export type DateRange = {
  preset: DateRangePreset;
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;
};

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  storageKey?: string; // localStorage key to persist selection
};

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '60d', label: '60D' },
  { key: '90d', label: '90D' },
  { key: '180d', label: '6M' },
  { key: '365d', label: '1Y' },
  { key: 'all', label: 'All' },
];

function computeRange(preset: DateRangePreset, customStart?: string, customEnd?: string): DateRange {
  const today = new Date().toISOString().slice(0, 10);

  if (preset === 'custom' && customStart && customEnd) {
    return { preset, startDate: customStart, endDate: customEnd };
  }

  if (preset === 'all') {
    return { preset, startDate: '2020-01-01', endDate: today };
  }

  const days: Record<string, number> = {
    '7d': 7, '30d': 30, '60d': 60, '90d': 90, '180d': 180, '365d': 365,
  };

  const d = days[preset] ?? 30;
  const start = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

  return { preset, startDate: start, endDate: today };
}

export function getDefaultRange(storageKey?: string): DateRange {
  if (typeof window !== 'undefined' && storageKey) {
    try {
      const saved = localStorage.getItem(`dateRange_${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.preset === 'custom') return parsed;
        return computeRange(parsed.preset);
      }
    } catch { /* ignore */ }
  }
  return computeRange('30d');
}

export default function DateRangeFilter({ value, onChange, storageKey }: Props) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);

  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(`dateRange_${storageKey}`, JSON.stringify(value));
      } catch { /* ignore */ }
    }
  }, [value, storageKey]);

  function handlePreset(preset: DateRangePreset) {
    setShowCustom(false);
    onChange(computeRange(preset));
  }

  function handleCustom() {
    setShowCustom(true);
    onChange(computeRange('custom', customStart, customEnd));
  }

  function applyCustom() {
    onChange(computeRange('custom', customStart, customEnd));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium min-h-[32px] ${
              value.preset === p.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={handleCustom}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium min-h-[32px] ${
            value.preset === 'custom' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <button onClick={applyCustom}
            className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-700 min-h-[32px]">
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Utility: determine chart aggregation based on range span.
 */
export function getAggregation(startDate: string, endDate: string): 'daily' | 'weekly' | 'monthly' {
  const span = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  if (span <= 60) return 'daily';
  if (span <= 365) return 'weekly';
  return 'monthly';
}
