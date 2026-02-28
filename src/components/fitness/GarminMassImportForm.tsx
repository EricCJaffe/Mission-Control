'use client';

import { useState } from 'react';
import { Activity, Moon, Scale, TrendingUp, Upload, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { GarminImportResults, GarminImportOptions } from '@/lib/fitness/garmin-import';

export default function GarminMassImportForm() {
  const [exportPath, setExportPath] = useState('/Users/ericjaffe/Downloads/823d045f-1d15-4f2c-8190-7ab3d6468566_1');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<GarminImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<{ fixed: number } | null>(null);

  const [options, setOptions] = useState<GarminImportOptions>({
    activities: true,
    sleep: true,
    biometrics: true,
    trainingReadiness: true, // Phase 2 - NOW ENABLED
    trainingLoad: true, // Phase 2 - NOW ENABLED
    wellness: true, // Phase 2 - NOW ENABLED
  });

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/fitness/garmin/mass-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportPath, options }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResults(data.results);
    } catch (err: any) {
      setError(err.message || 'An error occurred during import');
    } finally {
      setImporting(false);
    }
  };

  const handleFixDistances = async () => {
    setFixing(true);
    setFixResult(null);

    try {
      const response = await fetch('/api/fitness/garmin/fix-distances', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Fix failed');
      }

      setFixResult(data);
    } catch (err: any) {
      setError(err.message || 'Fix failed');
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Path Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Garmin Export Directory Path
        </label>
        <input
          type="text"
          value={exportPath}
          onChange={(e) => setExportPath(e.target.value)}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="/path/to/garmin/export"
        />
        <p className="mt-1 text-xs text-slate-500">
          Path to your Garmin Connect data export (the folder containing DI_CONNECT)
        </p>
      </div>

      {/* Import Categories */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">Select Data to Import</h3>
        <div className="space-y-3">
          {/* Activities */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-green-300 hover:bg-green-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.activities}
              onChange={(e) => setOptions({ ...options, activities: e.target.checked })}
              className="mt-1 h-4 w-4 text-green-600 rounded focus:ring-green-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-slate-800">Workouts & Activities</span>
              </div>
              <p className="text-sm text-slate-600">
                Running, cycling, strength training, and all other workouts with detailed metrics (HR, power, pace, TSS)
              </p>
            </div>
          </label>

          {/* Sleep */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.sleep}
              onChange={(e) => setOptions({ ...options, sleep: e.target.checked })}
              className="mt-1 h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Moon className="h-5 w-5 text-purple-600" />
                <span className="font-semibold text-slate-800">Sleep Data</span>
              </div>
              <p className="text-sm text-slate-600">
                Sleep stages (deep/light/REM/awake), sleep scores, respiration, HR, and stress during sleep
              </p>
            </div>
          </label>

          {/* Biometrics */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.biometrics}
              onChange={(e) => setOptions({ ...options, biometrics: e.target.checked })}
              className="mt-1 h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-800">Body Metrics</span>
              </div>
              <p className="text-sm text-slate-600">
                Weight tracking (falls back to Garmin if Withings data unavailable)
              </p>
            </div>
          </label>

          {/* Training Readiness */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.trainingReadiness}
              onChange={(e) => setOptions({ ...options, trainingReadiness: e.target.checked })}
              className="mt-1 h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                <span className="font-semibold text-slate-800">Training Readiness</span>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Phase 2</span>
              </div>
              <p className="text-sm text-slate-600">
                Daily readiness scores, recovery recommendations, HRV & sleep quality factors
              </p>
            </div>
          </label>

          {/* Training Load */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-yellow-300 hover:bg-yellow-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.trainingLoad}
              onChange={(e) => setOptions({ ...options, trainingLoad: e.target.checked })}
              className="mt-1 h-4 w-4 text-yellow-600 rounded focus:ring-yellow-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
                <span className="font-semibold text-slate-800">Training Load (PMC)</span>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Phase 2</span>
              </div>
              <p className="text-sm text-slate-600">
                Acute/Chronic Training Load, Fitness (CTL), Fatigue (ATL), Form (TSB)
              </p>
            </div>
          </label>

          {/* Wellness Metrics */}
          <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl hover:border-teal-300 hover:bg-teal-50/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={options.wellness}
              onChange={(e) => setOptions({ ...options, wellness: e.target.checked })}
              className="mt-1 h-4 w-4 text-teal-600 rounded focus:ring-teal-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-5 w-5 text-teal-600" />
                <span className="font-semibold text-slate-800">Daily Wellness Metrics</span>
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">Phase 2</span>
              </div>
              <p className="text-sm text-slate-600">
                Daily HRV, resting heart rate, skin temperature, and health status data
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={importing || !exportPath}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {importing ? (
          <>
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            Start Import
          </>
        )}
      </button>

      {/* Fix Distance Button */}
      <button
        onClick={handleFixDistances}
        disabled={fixing}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {fixing ? (
          <>
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Fixing...
          </>
        ) : (
          <>
            <AlertCircle className="h-5 w-5" />
            Fix Distance Data (if imported before this fix)
          </>
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900 mb-1">Import Failed</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <div className="p-6 bg-green-50 border border-green-200 rounded-xl space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <h4 className="text-lg font-semibold text-green-900">Import Complete</h4>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {/* Activities */}
            {options.activities && (
              <div className="p-4 bg-white rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-green-600" />
                  <span className="font-semibold text-slate-800">Activities</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-green-700">
                    <span className="font-semibold">{results.activities.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.activities.skipped}</span> skipped
                  </p>
                  {results.activities.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.activities.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Sleep */}
            {options.sleep && (
              <div className="p-4 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="h-4 w-4 text-purple-600" />
                  <span className="font-semibold text-slate-800">Sleep</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-purple-700">
                    <span className="font-semibold">{results.sleep.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.sleep.skipped}</span> skipped
                  </p>
                  {results.sleep.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.sleep.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Biometrics */}
            {options.biometrics && (
              <div className="p-4 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold text-slate-800">Biometrics</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-blue-700">
                    <span className="font-semibold">{results.biometrics.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.biometrics.skipped}</span> skipped
                  </p>
                  {results.biometrics.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.biometrics.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Training Readiness */}
            {options.trainingReadiness && results.trainingReadiness && (
              <div className="p-4 bg-white rounded-lg border border-indigo-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  <span className="font-semibold text-slate-800">Readiness</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-indigo-700">
                    <span className="font-semibold">{results.trainingReadiness.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.trainingReadiness.skipped}</span> skipped
                  </p>
                  {results.trainingReadiness.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.trainingReadiness.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Training Load */}
            {options.trainingLoad && results.trainingLoad && (
              <div className="p-4 bg-white rounded-lg border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                  <span className="font-semibold text-slate-800">Training Load</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-yellow-700">
                    <span className="font-semibold">{results.trainingLoad.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.trainingLoad.skipped}</span> skipped
                  </p>
                  {results.trainingLoad.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.trainingLoad.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Wellness */}
            {options.wellness && results.wellness && (
              <div className="p-4 bg-white rounded-lg border border-teal-200">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-teal-600" />
                  <span className="font-semibold text-slate-800">Wellness</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-teal-700">
                    <span className="font-semibold">{results.wellness.imported}</span> imported
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">{results.wellness.skipped}</span> skipped
                  </p>
                  {results.wellness.errors > 0 && (
                    <p className="text-red-600">
                      <span className="font-semibold">{results.wellness.errors}</span> errors
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Global Errors */}
          {results.errors && results.errors.length > 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-yellow-900 mb-2">Warnings</h5>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {results.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600 pt-2 border-t border-green-200">
            Data has been imported successfully. Visit the{' '}
            <a href="/fitness" className="text-green-700 font-semibold hover:underline">
              fitness dashboard
            </a>
            {' '}to view your imported data.
          </p>
        </div>
      )}

      {/* Fix Result Display */}
      {fixResult && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-orange-600" />
            <h4 className="font-semibold text-orange-900">Distance Data Fixed</h4>
          </div>
          <p className="text-sm text-orange-800">
            Fixed {fixResult.fixed} cardio activities with incorrect distance values.
            Distances that were 100x too high have been corrected.
          </p>
        </div>
      )}
    </div>
  );
}
