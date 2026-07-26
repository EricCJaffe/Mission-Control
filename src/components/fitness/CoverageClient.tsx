'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, MinusCircle, HelpCircle, Circle } from 'lucide-react';

type CoverageStatus =
  | 'strong'
  | 'maintained'
  | 'thinning'
  | 'stale'
  | 'absent'
  | 'not_tracked';

type AttributeCoverage = {
  attribute: string;
  label: string;
  status: CoverageStatus;
  lastTrained: string | null;
  daysSince: number | null;
  daysInWindow: number;
  note: string;
};

type CoverageReport = {
  referenceDate: string;
  windowMonths: number;
  attributes: AttributeCoverage[];
  gaps: string[];
};

const WINDOWS = [3, 6, 12, 24];

const STATUS_META: Record<
  CoverageStatus,
  { label: string; dot: string; text: string; Icon: typeof Circle }
> = {
  strong: { label: 'Strong', dot: 'bg-emerald-500', text: 'text-emerald-700', Icon: CheckCircle2 },
  maintained: { label: 'Maintained', dot: 'bg-emerald-400', text: 'text-emerald-600', Icon: CheckCircle2 },
  thinning: { label: 'Thinning', dot: 'bg-amber-400', text: 'text-amber-700', Icon: MinusCircle },
  stale: { label: 'Stale', dot: 'bg-orange-500', text: 'text-orange-700', Icon: AlertTriangle },
  absent: { label: 'Absent', dot: 'bg-red-500', text: 'text-red-700', Icon: AlertTriangle },
  not_tracked: { label: 'Not tracked', dot: 'bg-slate-300', text: 'text-slate-500', Icon: HelpCircle },
};

export default function CoverageClient() {
  const [months, setMonths] = useState(6);
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // No AI here — pure computation — so auto-loading on mount and on window
  // change is free and does not violate the token discipline on the AI surfaces.
  // Re-runs whenever the look-back window changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/fitness/coverage?months=${months}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) setReport(data.report);
        else setError(data.error || 'Failed to load coverage');
      } catch {
        if (!cancelled) setError('Network error — could not load coverage');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [months]);

  const gaps = report?.attributes.filter(a => a.status === 'stale' || a.status === 'absent') ?? [];

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Looking back</span>
        {WINDOWS.map(w => (
          <button
            key={w}
            onClick={() => setMonths(w)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium min-h-[36px] ${
              months === w
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {w >= 12 ? `${w / 12} year${w > 12 ? 's' : ''}` : `${w} months`}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          <p className="mt-3 text-sm text-slate-500">Reading your training history…</p>
        </div>
      )}

      {!loading && report && (
        <>
          {/* Gaps callout — the point of the page */}
          {gaps.length > 0 ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" />
                <div>
                  <p className="text-sm font-medium text-orange-900">
                    {gaps.length} attribute{gaps.length === 1 ? '' : 's'} going neglected
                  </p>
                  <p className="mt-0.5 text-xs text-orange-800">
                    {gaps.map(g => g.label).join(' · ')} — resilience comes from covering all of
                    these, not maxing a few.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900">
                  Well-rounded over the last {report.windowMonths} months — nothing badly neglected.
                </p>
              </div>
            </div>
          )}

          {/* Attribute rows, worst-first */}
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {report.attributes.map((a, i) => {
              const meta = STATUS_META[a.status];
              const Icon = meta.Icon;
              return (
                <div
                  key={a.attribute}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    i > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{a.label}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.text}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{a.note}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="px-1 text-xs text-slate-400">
            &ldquo;Not tracked&rdquo; means no exercise in your library is tagged for that attribute
            yet — tag your lifts to light it up. Missing tags never count as a gap.
          </p>
        </>
      )}
    </div>
  );
}
