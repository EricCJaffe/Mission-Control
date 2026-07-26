'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, Clock, Activity, Moon, Footprints } from 'lucide-react';
import Link from 'next/link';

type ImportLog = {
  id: string;
  import_date: string;
  status: string;
  workouts_imported: number;
  workouts_skipped: number;
  sleep_imported: number;
  sleep_skipped: number;
  daily_imported: number;
  daily_skipped: number;
  body_imported: number;
  body_skipped: number;
  error_message: string | null;
  created_at: string;
};

type ImportResults = {
  workouts: { imported: number; updated: number; skipped: number; errors: number };
  sleep: { imported: number; updated: number; skipped: number; errors: number };
  daily: { imported: number; updated: number; skipped: number; errors: number };
  body: { imported: number; updated: number; skipped: number; errors: number };
};

type HistorySummary = {
  workouts: number;
  sleepLogs: number;
  dailySummaries: number;
};

export default function AppleHealthImportClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [history, setHistory] = useState<ImportLog[]>([]);
  const [summary, setSummary] = useState<HistorySummary>({ workouts: 0, sleepLogs: 0, dailySummaries: 0 });

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await fetch('/api/fitness/apple-health/history', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data.imports ?? []);
      setSummary(data.summary ?? { workouts: 0, sleepLogs: 0, dailySummaries: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/fitness/apple-health/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setResults(data.results);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Apple Health Import</h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload a JSON export from the{' '}
              <strong>Health Auto Export</strong> app. Workouts are always
              imported (deduped by timestamp). Sleep, daily summaries, and body
              metrics respect your source preferences.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-8 transition hover:border-pink-400 hover:bg-pink-50/30">
            <Upload className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              {importing ? 'Importing…' : 'Drop JSON file or click to upload'}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileUpload}
              disabled={importing}
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <p>
            <strong>Tip:</strong> In Health Auto Export, configure an
            &quot;Automation&quot; export that runs daily and saves JSON to
            iCloud / Files. Then upload the latest file here, or set up
            REST API export to post directly to{' '}
            <code className="rounded bg-blue-100 px-1 py-0.5 text-xs">
              /api/fitness/apple-health/import
            </code>.
          </p>
        </div>

        {/* Totals */}
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Link href="/fitness/history" className="rounded-xl border border-slate-200 p-4 text-center transition hover:border-pink-300 hover:bg-pink-50/50">
            <Activity className="mx-auto h-5 w-5 text-pink-600" />
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.workouts}</p>
            <p className="text-sm text-slate-500">Apple Health workouts</p>
          </Link>
          <Link href="/fitness/sleep" className="rounded-xl border border-slate-200 p-4 text-center transition hover:border-indigo-300 hover:bg-indigo-50/50">
            <Moon className="mx-auto h-5 w-5 text-indigo-600" />
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.sleepLogs}</p>
            <p className="text-sm text-slate-500">Sleep logs</p>
          </Link>
          <Link href="/fitness/metrics" className="rounded-xl border border-slate-200 p-4 text-center transition hover:border-emerald-300 hover:bg-emerald-50/50">
            <Footprints className="mx-auto h-5 w-5 text-emerald-600" />
            <p className="mt-1 text-2xl font-bold text-slate-900">{summary.dailySummaries}</p>
            <p className="text-sm text-slate-500">Daily summaries</p>
          </Link>
        </div>
      </div>

      {/* Latest import results */}
      {results && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-semibold">Import Results</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DomainCard label="Workouts" stats={results.workouts} />
            <DomainCard label="Sleep" stats={results.sleep} />
            <DomainCard label="Daily summaries" stats={results.daily} />
            <DomainCard label="Body metrics" stats={results.body} />
          </div>
        </div>
      )}

      {/* Import history */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            <h3 className="text-lg font-semibold">Import History</h3>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {history.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="font-medium text-slate-800">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    log.status === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : log.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}>
                    {log.status}
                  </span>
                </div>
                <div className="text-slate-500">
                  {log.workouts_imported + log.sleep_imported + log.daily_imported + log.body_imported} imported
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DomainCard({
  label,
  stats,
}: {
  label: string;
  stats: { imported: number; updated: number; skipped: number; errors: number };
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-900">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <span>{stats.imported} imported</span>
        <span>{stats.updated} updated</span>
        <span>{stats.skipped} skipped</span>
        {stats.errors > 0 && <span className="text-red-600">{stats.errors} errors</span>}
      </div>
    </div>
  );
}
