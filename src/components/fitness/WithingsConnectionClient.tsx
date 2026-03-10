'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Link2, RefreshCw, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import WithingsImportForm from './WithingsImportForm';

type StatusPayload = {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error';
  providerUserId: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  syncState: Record<string, unknown>;
  summary: {
    bodyMetrics: number;
    bloodPressure: number;
    sleepLogs: number;
    dailySummaries: number;
  };
};

type SyncResults = {
  bp: { imported: number; updated: number; skipped: number; errors: number };
  weight: { imported: number; updated: number; skipped: number; errors: number };
  sleep: { imported: number; updated: number; skipped: number; errors: number };
  dailyAggregates: { imported: number; updated: number; skipped: number; errors: number };
};

export default function WithingsConnectionClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResults | null>(null);
  const [queuedUpdates, setQueuedUpdates] = useState<number | null>(null);

  const flashMessage = useMemo(() => {
    if (searchParams.get('connected') === '1') {
      return 'Withings connected successfully.';
    }
    const queryError = searchParams.get('error');
    return queryError ? `Withings connection failed: ${queryError}` : null;
  }, [searchParams]);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/fitness/withings/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Withings status');
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Withings status');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/withings/connect/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start Withings connection');
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Withings connection');
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncResults(null);
    setQueuedUpdates(null);
    try {
      const mode = status?.lastSyncAt ? 'incremental' : 'initial';
      const res = await fetch('/api/fitness/withings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withings sync failed');
      setSyncResults(data.results);
      setQueuedUpdates(data.queuedUpdates ?? 0);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withings sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Withings and remove stored access tokens?')) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/withings/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect Withings');
      setSyncResults(null);
      setQueuedUpdates(null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Withings');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Withings API Sync</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect Withings for blood pressure, body composition, sleep, and daily summary sync.
            </p>
          </div>
          <StatusBadge status={status?.status || 'disconnected'} />
        </div>

        {(flashMessage || error) && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error || (flashMessage && flashMessage.includes('failed')) ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
            {error || flashMessage}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MetricCard label="Connection" value={status?.connected ? 'Connected' : 'Not connected'} icon={<Link2 className="h-5 w-5 text-blue-600" />} />
          <MetricCard label="Last sync" value={status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'} icon={<RefreshCw className="h-5 w-5 text-emerald-600" />} />
          <MetricCard label="Provider user" value={status?.providerUserId || 'Not available'} icon={<Activity className="h-5 w-5 text-indigo-600" />} />
          <MetricCard label="Last result" value={status?.lastSyncStatus || 'Not run'} icon={<ShieldAlert className="h-5 w-5 text-amber-600" />} />
        </div>

        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <p>
            <strong>Source of truth:</strong> Withings is used for health metrics. Garmin remains the workout source of truth.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!status?.connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting || loading}
              className="min-h-[44px] rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {connecting ? 'Redirecting…' : 'Connect Withings'}
            </button>
          ) : (
            <>
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className="min-h-[44px] rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting || loading}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <CountCard label="Body metrics" value={status?.summary.bodyMetrics ?? 0} href="/fitness/trends" />
          <CountCard label="BP readings" value={status?.summary.bloodPressure ?? 0} href="/fitness/bp" />
          <CountCard label="Sleep logs" value={status?.summary.sleepLogs ?? 0} href="/fitness/sleep" />
          <CountCard label="Daily summaries" value={status?.summary.dailySummaries ?? 0} href="/fitness/metrics" />
        </div>

        {status?.lastError && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Last sync error: {status.lastError}
          </div>
        )}
      </div>

      {syncResults && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold">Latest Sync Summary</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SyncDomainCard label="Blood pressure" stats={syncResults.bp} href="/fitness/bp" />
            <SyncDomainCard label="Body metrics" stats={syncResults.weight} href="/fitness/trends" />
            <SyncDomainCard label="Sleep" stats={syncResults.sleep} href="/fitness/sleep" />
            <SyncDomainCard label="Daily summaries" stats={syncResults.dailyAggregates} href="/fitness/metrics" />
          </div>
          {queuedUpdates != null && (
            <p className="mt-4 text-sm text-slate-600">
              Queued `health.md` updates from sync: <strong>{queuedUpdates}</strong>
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-slate-500" />
          <h3 className="text-lg font-semibold">Legacy / Historical CSV Import</h3>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Keep using the original filesystem import if you want to backfill an old Withings export manually.
        </p>
        <div className="mt-6">
          <WithingsImportForm />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === 'connected'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'error'
      ? 'bg-red-100 text-red-700'
      : 'bg-slate-100 text-slate-700';
  return <div className={`rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>{status}</div>;
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">{icon}<span>{label}</span></div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CountCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 p-4 text-center transition hover:border-blue-300 hover:bg-blue-50/50">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </Link>
  );
}

function SyncDomainCard({ label, stats, href }: { label: string; stats: { imported: number; updated: number; skipped: number; errors: number }; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/50">
      <p className="font-semibold text-slate-900">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <span>{stats.imported} imported</span>
        <span>{stats.updated} updated</span>
        <span>{stats.skipped} skipped</span>
        <span>{stats.errors} errors</span>
      </div>
    </Link>
  );
}
