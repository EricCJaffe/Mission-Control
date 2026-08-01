'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

type SyncCounts = { imported?: number; updated?: number; skipped?: number; errors?: number };
type SyncResults = Record<string, SyncCounts>;

type Status = {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * One-tap Withings sync.
 *
 * Withings is the source of truth for blood pressure and body composition, and
 * nothing schedules this — the sync only runs when someone asks for it. Before
 * this existed the control was three clicks deep under Settings, which is how
 * five months of drift went unnoticed. The card turns amber once the data is
 * more than a couple of days old so staleness is visible rather than silent.
 */
export default function WithingsSyncButton() {
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/fitness/withings/status');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      // Status is advisory; the button still works without it.
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setResults(null);
    try {
      // Incremental resumes from the last successful sync (minus a day of
      // overlap), so even a long gap is covered by one press.
      const mode = status?.lastSyncAt ? 'incremental' : 'initial';
      const res = await fetch('/api/fitness/withings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withings sync failed');
      setResults(data.results ?? null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withings sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const age = daysSince(status?.lastSyncAt ?? null);
  const stale = age === null || age >= 2;

  if (status && !status.connected) {
    return (
      <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Withings not connected</p>
        <p className="mt-1 text-xs text-slate-500">
          Blood pressure and body composition come from Withings.
        </p>
        <Link
          href="/fitness/settings/withings"
          className="mt-2 inline-block text-xs font-medium text-lime-700 hover:text-lime-800"
        >
          Connect Withings →
        </Link>
      </div>
    );
  }

  const totals = results
    ? Object.values(results).reduce<{ imported: number; updated: number }>(
        (acc, r) => ({
          imported: acc.imported + (r.imported ?? 0),
          updated: acc.updated + (r.updated ?? 0),
        }),
        { imported: 0, updated: 0 }
      )
    : null;

  return (
    <div
      className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${
        stale ? 'border-amber-300' : 'border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Withings</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {status?.lastSyncAt
              ? age === 0
                ? 'Synced today'
                : `Last synced ${age} day${age === 1 ? '' : 's'} ago`
              : 'Never synced'}
            {stale && <span className="text-amber-600"> · BP &amp; weight may be stale</span>}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-lime-500 px-4 text-sm font-semibold text-white hover:bg-lime-600 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {totals && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-lime-50 p-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" />
          <div className="text-xs text-slate-700">
            <p className="font-medium">
              Imported {totals.imported}, updated {totals.updated}.
            </p>
            <p className="mt-0.5 text-slate-500">
              {Object.entries(results!)
                .filter(([, r]) => (r.imported ?? 0) + (r.updated ?? 0) > 0)
                .map(([k, r]) => `${k}: ${(r.imported ?? 0) + (r.updated ?? 0)}`)
                .join(' · ') || 'Nothing new.'}
            </p>
          </div>
        </div>
      )}

      {(error || status?.lastError) && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs text-red-700">{error || status?.lastError}</p>
        </div>
      )}
    </div>
  );
}
