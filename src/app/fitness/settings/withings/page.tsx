import { Metadata } from 'next';
import WithingsConnectionClient from '@/components/fitness/WithingsConnectionClient';

export const metadata: Metadata = {
  title: 'Withings Sync | Fitness',
};

export default function WithingsImportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Withings Sync</h1>
        <p className="mt-2 text-slate-600">
          Connect your Withings account for health metric sync, or use the legacy CSV importer below.
        </p>
      </div>

      <WithingsConnectionClient />
    </div>
  );
}
