/**
 * Garmin FIT File Import Page
 *
 * Allows users to upload FIT files exported from Garmin Connect
 * Supports wellness data (WELLNESS.fit) and activity files
 */

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GarminImportPage() {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    total?: number;
    processed?: number;
    failed?: number;
    metrics_imported?: number;
    errors?: string[];
    imported_data?: Record<string, Record<string, any>>;
  } | null>(null);

  async function handleImport(e: FormEvent) {
    e.preventDefault();

    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select FIT files to import');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();

      // Add all selected files
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append('files', selectedFiles[i]);
      }

      const res = await fetch('/api/fitness/garmin/import-fit', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);

      // If successful, redirect after a delay
      if (data.success && data.processed > 0) {
        setTimeout(() => {
          router.push('/fitness/metrics');
        }, 3000);
      }
    } catch (error) {
      console.error('Import error:', error);
      setResult({
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back
        </button>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">Import Garmin FIT Files</h1>
        <p className="mb-6 text-sm text-gray-600">
          Upload FIT files from your Garmin Connect export to import wellness data, activities,
          and metrics.
        </p>

        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-blue-900">How to export from Garmin:</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-blue-800">
            <li>
              Go to{' '}
              <a
                href="https://connect.garmin.com/modern/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Garmin Connect
              </a>
            </li>
            <li>Click profile picture → Account Settings</li>
            <li>Scroll to Data Management → Export Your Data</li>
            <li>Select date range and request export</li>
            <li>Download the ZIP file when ready (usually within 24 hours)</li>
            <li>Extract and upload the FIT files here</li>
          </ol>
        </div>

        <form onSubmit={handleImport} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select FIT Files
            </label>
            <input
              type="file"
              accept=".fit"
              multiple
              onChange={(e) => setSelectedFiles(e.target.files)}
              disabled={uploading}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {selectedFiles && selectedFiles.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={uploading || !selectedFiles || selectedFiles.length === 0}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {uploading ? 'Importing...' : 'Import FIT Files'}
          </button>
        </form>

        {result && (
          <div
            className={`mt-6 rounded-lg p-4 ${
              result.success ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
            }`}
          >
            <h3 className="mb-2 font-semibold">
              {result.success ? 'Import Complete' : 'Import Failed'}
            </h3>

            {result.success && (
              <div className="space-y-1 text-sm">
                <p>Total files: {result.total}</p>
                <p>Successfully processed: {result.processed}</p>
                {result.failed != null && result.failed > 0 && <p>Failed: {result.failed}</p>}
                {result.metrics_imported != null && result.metrics_imported > 0 && (
                  <p className="font-medium">Metrics imported: {result.metrics_imported}</p>
                )}

                {result.imported_data && Object.keys(result.imported_data).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="font-medium text-green-800">Extracted values:</p>
                    {Object.entries(result.imported_data).map(([date, values]) => (
                      <div key={date} className="rounded-md bg-green-100/60 p-3 text-xs">
                        <p className="mb-1 font-semibold">{date}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          {values.restingHeartRate != null && <p>RHR: {values.restingHeartRate} bpm</p>}
                          {values.hrvMs != null && <p>HRV: {values.hrvMs} ms</p>}
                          {values.bodyBattery != null && <p>Body Battery: {values.bodyBattery}</p>}
                          {values.stressLevel != null && <p>Stress: {values.stressLevel}</p>}
                          {values.calories != null && <p>Calories/RMR: {values.calories}</p>}
                          {values.steps != null && <p>Steps: {values.steps}</p>}
                          {values.sleepScore != null && <p>Sleep Score: {values.sleepScore}</p>}
                          {values.sleepDurationHours != null && <p>Sleep: {values.sleepDurationHours.toFixed(1)}h</p>}
                          {values.weight != null && <p>Weight: {values.weight} kg</p>}
                          {values.bodyFatPercent != null && <p>Body Fat: {values.bodyFatPercent}%</p>}
                        </div>
                        {Object.values(values).every((v) => v == null) && (
                          <p className="text-amber-700">No metrics extracted — check server logs for [FIT Debug] output</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-xs text-green-700">
                  Redirecting to metrics page in 3 seconds...
                </p>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-sm font-medium">Errors:</p>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  {result.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Supported file types:</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
            <li>
              <strong>WELLNESS.fit</strong> - Daily metrics (body battery, RMR, heart rate)
            </li>
            <li>
              <strong>METRICS.fit</strong> - Additional metrics data
            </li>
            <li>
              <strong>Activity files</strong> - Individual workout/activity data (coming soon)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
