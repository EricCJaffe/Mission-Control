/**
 * Garmin Mass Import Page
 *
 * Bulk import historical data from Garmin Connect export
 * Imports activities, sleep, biometrics, and wellness metrics
 */

import GarminMassImportForm from '@/components/fitness/GarminMassImportForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function GarminMassImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div>
        <Link
          href="/fitness/settings"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <h1 className="text-3xl font-bold">Garmin Mass Import</h1>
        <p className="mt-2 text-slate-600">
          Import historical data from your Garmin Connect export in bulk
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">How to Export from Garmin Connect</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>
            Go to{' '}
            <a
              href="https://connect.garmin.com/modern/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 font-semibold hover:underline"
            >
              Garmin Connect
            </a>
          </li>
          <li>Click your profile picture → Account Settings</li>
          <li>Scroll to Data Management → Export Your Data</li>
          <li>Select your desired date range</li>
          <li>Click Request Data Export</li>
          <li>Wait for email notification (usually within 24 hours)</li>
          <li>Download and extract the ZIP file</li>
          <li>Copy the full path to the extracted folder and paste it below</li>
        </ol>

        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <p className="font-semibold mb-1">Example path:</p>
          <code className="text-xs">/Users/yourname/Downloads/823d045f-1d15-4f2c-8190-7ab3d6468566_1</code>
        </div>
      </div>

      {/* Import Form */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Import Data</h2>
        <GarminMassImportForm />
      </div>

      {/* What Gets Imported */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">What Gets Imported</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-green-700 mb-2">Activities & Workouts</h3>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>• Activity type, duration, distance</li>
              <li>• Heart rate (avg/max/min) + HR zones</li>
              <li>• Power data (avg/max/normalized)</li>
              <li>• Training load / TSS</li>
              <li>• VO2 max, lactate threshold</li>
              <li>• Advanced metrics (cadence, pace, etc.)</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-purple-700 mb-2">Sleep Data</h3>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>• Sleep stages (deep/light/REM/awake)</li>
              <li>• Sleep scores with breakdowns</li>
              <li>• Respiration rate (avg/min/max)</li>
              <li>• Sleep stress levels</li>
              <li>• Wake count and restless moments</li>
              <li>• Heart rate during sleep</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-blue-700 mb-2">Body Metrics</h3>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>• Weight tracking (daily)</li>
              <li>• Fallback data if Withings unavailable</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-500 mb-2">Coming in Phase 2</h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Training Readiness scores</li>
              <li>• Body Battery tracking</li>
              <li>• HRV and resting HR</li>
              <li>• Daily stress levels</li>
              <li>• VO2 max trends</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Safety Note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Safe to reimport:</span> This tool uses smart UPSERT logic.
          If you reimport the same data, duplicates will be prevented and existing records will be preserved.
        </p>
      </div>
    </div>
  );
}
