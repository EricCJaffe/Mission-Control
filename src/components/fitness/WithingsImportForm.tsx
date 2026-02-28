'use client';

import { useState } from 'react';
import { Download, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function WithingsImportForm() {
  const [exportPath, setExportPath] = useState('/Users/ericjaffe/Downloads/withings');
  const [importing, setImporting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  async function handleImport() {
    if (!exportPath.trim()) {
      alert('Please enter an export path');
      return;
    }

    setImporting(true);
    setResults(null);

    try {
      const response = await fetch('/api/fitness/withings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportPath }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResults(data);
    } catch (error: any) {
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleCleanup() {
    if (!confirm('Remove all Withings workout imports? This cannot be undone. (Garmin is your workout source)')) {
      return;
    }

    setCleaning(true);
    setCleanupResult(null);

    try {
      const response = await fetch('/api/fitness/withings/cleanup', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Cleanup failed');
      }

      setCleanupResult(data);
    } catch (error: any) {
      alert(`Cleanup failed: ${error.message}`);
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Import Form */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Import Data</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="exportPath" className="block text-sm font-medium text-slate-700 mb-2">
              Withings Export Directory
            </label>
            <input
              type="text"
              id="exportPath"
              value={exportPath}
              onChange={(e) => setExportPath(e.target.value)}
              placeholder="/path/to/withings/export"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-sm text-slate-500">
              Path to the folder containing bp.csv, weight.csv, sleep.csv, etc.
            </p>
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {importing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Import Withings Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* Import Results */}
      {results && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Import Results</h2>

          <div className="space-y-3">
            <ResultRow
              label="Blood Pressure Readings"
              imported={results.results?.bp?.imported || 0}
              skipped={results.results?.bp?.skipped || 0}
              errors={results.results?.bp?.errors || 0}
            />
            <ResultRow
              label="Body Composition Entries"
              imported={results.results?.weight?.imported || 0}
              skipped={results.results?.weight?.skipped || 0}
              errors={results.results?.weight?.errors || 0}
            />
            <ResultRow
              label="Daily Activity Summaries"
              imported={results.results?.dailyAggregates?.imported || 0}
              skipped={results.results?.dailyAggregates?.skipped || 0}
              errors={results.results?.dailyAggregates?.errors || 0}
            />
            <ResultRow
              label="Sleep Logs"
              imported={results.results?.sleep?.imported || 0}
              skipped={results.results?.sleep?.skipped || 0}
              errors={results.results?.sleep?.errors || 0}
            />
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{results.summary?.totalImported || 0}</p>
                <p className="text-sm text-slate-600">Imported</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-400">{results.summary?.totalSkipped || 0}</p>
                <p className="text-sm text-slate-600">Skipped</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{results.summary?.totalErrors || 0}</p>
                <p className="text-sm text-slate-600">Errors</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Section */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-amber-900">Clean Up Withings Workouts</h2>
        <p className="mb-4 text-sm text-amber-800">
          Remove all workout activities imported from Withings. Use this if you want Garmin to be
          your sole workout data source.
        </p>

        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-6 py-3 font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {cleaning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Cleaning...
            </>
          ) : (
            <>
              <Trash2 className="h-5 w-5" />
              Remove Withings Workouts
            </>
          )}
        </button>

        {cleanupResult && (
          <div className="mt-4 rounded-lg bg-white border border-amber-200 p-4">
            <p className="text-sm font-medium text-amber-900">
              ✓ Removed {cleanupResult.deleted} Withings workout imports
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  imported,
  skipped,
  errors,
}: {
  label: string;
  imported: number;
  skipped: number;
  errors: number;
}) {
  const hasErrors = errors > 0;
  const hasData = imported > 0 || skipped > 0;

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-3">
        {hasErrors ? (
          <XCircle className="h-5 w-5 text-red-500" />
        ) : hasData ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-green-600">{imported} imported</span>
        <span className="text-slate-400">{skipped} skipped</span>
        {errors > 0 && <span className="text-red-600">{errors} errors</span>}
      </div>
    </div>
  );
}
