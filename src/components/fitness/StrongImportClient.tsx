'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, FileText, X } from 'lucide-react';

interface ImportSummary {
  workouts_imported: number;
  workouts_skipped_duplicate: number;
  workouts_skipped_no_sets: number;
  sets_imported: number;
  sets_skipped_cardio: number;
  unmapped_exercises: string[];
}

export default function StrongImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && !selected.name.endsWith('.csv')) {
      setError('Please select a .csv file exported from the Strong app.');
      return;
    }
    setFile(selected);
    setError(null);
    setResult(null);
  }

  function clearFile() {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/fitness/history/strong-import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Import failed');
        return;
      }

      setResult(json.summary);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Instructions */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-3">How to export from Strong</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-600">
          <li>Open the Strong app on your phone</li>
          <li>Go to <strong>Profile</strong> → <strong>Settings</strong> → <strong>Export Data</strong></li>
          <li>Choose <strong>CSV</strong> format and save/share the file</li>
          <li>Upload the exported <code className="bg-slate-100 px-1 rounded text-xs">strong_workouts.csv</code> below</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Only strength exercises are imported. Cardio rows (Running, Elliptical, etc.) are skipped.
          Duplicate sessions are detected and skipped automatically.
        </p>
      </div>

      {/* Upload area */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Upload CSV</h2>

        {!file ? (
          <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 p-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
            <Upload className="w-8 h-8 text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Click to select your Strong export</p>
              <p className="text-xs text-slate-500 mt-1">CSV files only</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
            <button onClick={clearFile} className="p-1 rounded-lg hover:bg-slate-200 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="mt-4 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import Workout History
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-base font-semibold text-slate-800">Import complete</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="Workouts imported"
              value={result.workouts_imported}
              color="green"
            />
            <StatCard
              label="Sets imported"
              value={result.sets_imported}
              color="blue"
            />
            <StatCard
              label="Already existed"
              value={result.workouts_skipped_duplicate}
              color="slate"
            />
            <StatCard
              label="Cardio sets skipped"
              value={result.sets_skipped_cardio}
              color="slate"
            />
            <StatCard
              label="Empty sessions skipped"
              value={result.workouts_skipped_no_sets}
              color="slate"
            />
          </div>

          {result.unmapped_exercises.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-sm font-medium text-amber-800 mb-2">
                {result.unmapped_exercises.length} unmapped exercise{result.unmapped_exercises.length !== 1 ? 's' : ''} were skipped
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {result.unmapped_exercises.map(name => (
                  <li key={name} className="font-mono">{name}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Your historical workouts are now visible in{' '}
            <a href="/fitness/history" className="text-blue-600 hover:underline font-medium">
              Workout History
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'slate';
}) {
  const colorMap = {
    green: 'text-green-700 bg-green-50 border-green-100',
    blue: 'text-blue-700 bg-blue-50 border-blue-100',
    slate: 'text-slate-700 bg-slate-50 border-slate-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
