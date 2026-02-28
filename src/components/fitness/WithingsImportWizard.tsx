'use client';

import { useState } from 'react';
import { Upload, Check, AlertCircle, Loader2, Database } from 'lucide-react';

type ImportResults = {
  bp: { imported: number; skipped: number; errors: number };
  weight: { imported: number; skipped: number; errors: number };
  activities: { imported: number; skipped: number; errors: number };
  dailyAggregates: { imported: number; skipped: number; errors: number };
  sleep: { imported: number; skipped: number; errors: number };
};

export default function WithingsImportWizard() {
  const [exportPath, setExportPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!exportPath.trim()) {
      setError('Please enter the export folder path');
      return;
    }

    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/fitness/withings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportPath: exportPath.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Import failed');
        return;
      }

      setResults(data.results);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setImporting(false);
    }
  };

  const getTotalImported = () => {
    if (!results) return 0;
    return (
      results.bp.imported +
      results.weight.imported +
      results.activities.imported +
      results.dailyAggregates.imported +
      results.sleep.imported
    );
  };

  const getTotalSkipped = () => {
    if (!results) return 0;
    return (
      results.bp.skipped +
      results.weight.skipped +
      results.activities.skipped +
      results.dailyAggregates.skipped +
      results.sleep.skipped
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-blue-600" />
          Withings Historical Data Import
        </h1>
        <p className="text-gray-600 mt-1">
          Import your historical health data from Withings Health Mate export.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-2">How to Export from Withings</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Open Withings Health Mate app or website</li>
          <li>Go to Settings → Privacy → Export my data</li>
          <li>Request export (you'll receive a download link via email)</li>
          <li>Download and extract the ZIP file to a folder</li>
          <li>Copy the folder path below (e.g., /Users/yourname/Downloads/data_ERI_1234567890)</li>
        </ol>
      </div>

      {/* Input Form */}
      {!results && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Export Folder Path
          </label>
          <input
            type="text"
            value={exportPath}
            onChange={(e) => setExportPath(e.target.value)}
            placeholder="/Users/yourname/Downloads/data_ERI_1772146385"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            disabled={importing}
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 text-red-600 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importing || !exportPath.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {importing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Importing Data...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Start Import
              </>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="rounded-2xl border border-green-100 bg-green-50 p-6">
            <div className="flex items-start gap-3">
              <Check className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900 text-lg">Import Complete!</h3>
                <p className="text-green-800 mt-1">
                  Successfully imported {getTotalImported()} records. {getTotalSkipped()} duplicates
                  were skipped.
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Import Summary</h3>
            <div className="space-y-3">
              {/* Blood Pressure */}
              <ResultRow
                label="Blood Pressure Readings"
                imported={results.bp.imported}
                skipped={results.bp.skipped}
                errors={results.bp.errors}
                icon="❤️"
              />

              {/* Body Composition */}
              <ResultRow
                label="Body Composition Entries"
                imported={results.weight.imported}
                skipped={results.weight.skipped}
                errors={results.weight.errors}
                icon="⚖️"
              />

              {/* Activities */}
              <ResultRow
                label="Workout Activities"
                imported={results.activities.imported}
                skipped={results.activities.skipped}
                errors={results.activities.errors}
                icon="🏃"
              />

              {/* Daily Summaries */}
              <ResultRow
                label="Daily Activity Summaries"
                imported={results.dailyAggregates.imported}
                skipped={results.dailyAggregates.skipped}
                errors={results.dailyAggregates.errors}
                icon="📊"
              />

              {/* Sleep */}
              <ResultRow
                label="Sleep Logs"
                imported={results.sleep.imported}
                skipped={results.sleep.skipped}
                errors={results.sleep.errors}
                icon="😴"
              />
            </div>
          </div>

          {/* Next Steps */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">What's Next?</h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  View your <a href="/fitness/bp" className="text-blue-600 hover:underline">blood pressure trends</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Check <a href="/fitness/trends" className="text-blue-600 hover:underline">body composition charts</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Review <a href="/fitness/history" className="text-blue-600 hover:underline">workout history</a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>
                  Your <a href="/fitness/health/view" className="text-blue-600 hover:underline">health.md document</a> may have auto-updated
                </span>
              </li>
            </ul>
          </div>

          {/* Import Another */}
          <button
            onClick={() => {
              setResults(null);
              setExportPath('');
              setError(null);
            }}
            className="w-full px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            Import Another Export
          </button>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  label,
  imported,
  skipped,
  errors,
  icon,
}: {
  label: string;
  imported: number;
  skipped: number;
  errors: number;
  icon: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        {imported > 0 && (
          <span className="text-green-600 font-medium">+{imported} new</span>
        )}
        {skipped > 0 && <span className="text-gray-500">{skipped} skipped</span>}
        {errors > 0 && <span className="text-red-600">{errors} errors</span>}
      </div>
    </div>
  );
}
