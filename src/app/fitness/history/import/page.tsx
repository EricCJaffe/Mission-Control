import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import StrongImportClient from '@/components/fitness/StrongImportClient';

export default function StrongImportPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/fitness/history"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to History
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Import Strong Workouts</h1>
        <p className="text-slate-500 text-sm mt-1">
          Import your historical workout data from the Strong app CSV export.
        </p>
      </div>

      <StrongImportClient />
    </div>
  );
}
