import CoverageClient from '@/components/fitness/CoverageClient';

export const dynamic = 'force-dynamic';

export default function CoveragePage() {
  return (
    <main className="pt-4 md:pt-8 pb-24">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Movement Coverage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Whether your training is well-rounded over the long haul — or quietly
          neglecting a whole attribute.
        </p>
      </div>
      <CoverageClient />
    </main>
  );
}
