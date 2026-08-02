'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

type Result = {
  proposed: number;
  sections: Array<{ number: number; name: string }>;
  skipped_already_pending: number;
  errors: string[];
};

/**
 * "Check for updates" for health.md.
 *
 * Detection used to run only as a side effect of uploading a file or a metric
 * shifting, which left no way to ask whether the document still matches the
 * data — the case that matters after importing older records. Proposals go to
 * the normal review queue; nothing is written without approval.
 */
export default function HealthDocCheckUpdates({ pendingCount = 0 }: { pendingCount?: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/fitness/health/check-updates', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Check failed');
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Keep health.md current</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {pendingCount > 0
              ? `${pendingCount} proposed change${pendingCount === 1 ? '' : 's'} awaiting your review.`
              : 'Compares the document against your labs, metrics, medications and imaging.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pendingCount > 0 && (
            <Link
              href="/fitness/health/review-updates"
              className="min-h-[44px] rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Review {pendingCount}
            </Link>
          )}
          <button
            type="button"
            onClick={check}
            disabled={running}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="text-xs text-slate-700">
            {result.proposed > 0 ? (
              <>
                <p className="font-medium">
                  {result.proposed} section{result.proposed === 1 ? '' : 's'} proposed for update.
                </p>
                <p className="mt-0.5 text-slate-500">
                  {result.sections.map((s) => `§${s.number} ${s.name}`).join(' · ')}
                </p>
                <Link
                  href="/fitness/health/review-updates"
                  className="mt-1 inline-block font-medium text-amber-700 hover:text-amber-800"
                >
                  Review them →
                </Link>
              </>
            ) : (
              <p className="font-medium">
                No changes proposed — the document already matches your current data.
                {result.skipped_already_pending > 0 &&
                  ` (${result.skipped_already_pending} section${result.skipped_already_pending === 1 ? '' : 's'} already awaiting review.)`}
              </p>
            )}
            {result.errors.length > 0 && (
              <p className="mt-1 text-amber-700">
                Some checks failed: {result.errors.join('; ')}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-xs text-rose-700">{error}</p>
        </div>
      )}
    </div>
  );
}
