import { Metadata } from 'next';
import AppleHealthImportClient from '@/components/fitness/AppleHealthImportClient';
import SourcePreferencesClient from '@/components/fitness/SourcePreferencesClient';

export const metadata: Metadata = {
  title: 'Apple Health | Fitness',
};

export default function AppleHealthPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Apple Health</h1>
        <p className="mt-2 text-slate-600">
          Import health data from Apple Watch via the Health Auto Export app.
          Configure source preferences below to control which device is used for
          each data category when using both Garmin and Apple Watch.
        </p>
      </div>

      <SourcePreferencesClient />
      <AppleHealthImportClient />
    </div>
  );
}
