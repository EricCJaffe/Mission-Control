import { Metadata } from 'next';
import WithingsImportForm from '@/components/fitness/WithingsImportForm';

export const metadata: Metadata = {
  title: 'Withings Import | Fitness',
};

export default function WithingsImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Withings Data Import</h1>
        <p className="mt-2 text-slate-600">
          Import historical data from your Withings Health Mate export. We'll import blood pressure,
          body composition, sleep data, and daily activity summaries.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">What Gets Imported</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-3 w-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">Blood Pressure Readings</p>
              <p className="text-sm text-slate-600">
                Systolic, diastolic, pulse with timestamps (critical for cardiac health)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="h-3 w-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">Body Composition</p>
              <p className="text-sm text-slate-600">
                Weight, body fat %, muscle mass, bone mass, hydration (if your scale supports it)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="h-3 w-3 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">Sleep Data</p>
              <p className="text-sm text-slate-600">
                Sleep stages, duration, heart rate during sleep, sleep quality metrics
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-3 w-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">Daily Activity Summaries</p>
              <p className="text-sm text-slate-600">
                Steps, distance, calories, floors climbed, resting heart rate
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Workout activities are NOT imported from Withings. We use Garmin
            as the workout data source for better accuracy and detail.
          </p>
        </div>
      </div>

      <WithingsImportForm />
    </div>
  );
}
