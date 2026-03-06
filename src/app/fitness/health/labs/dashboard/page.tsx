import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LabDashboardClient from '@/components/fitness/LabDashboardClient';
import { Upload, FlaskConical } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LabDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const params = await searchParams;
  const initialTab = params.tab === 'methylation' ? 'methylation' : 'bloodwork';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-600" />
              Lab Results Dashboard
            </h1>
            <p className="text-gray-600 mt-1">
              Comprehensive analysis of your lab results over time with trend visualization and AI insights.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/fitness/health/upload"
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm min-h-[44px]"
            >
              <Upload size={18} />
              Upload Labs
            </Link>
            <Link
              href="/fitness/health/labs"
              className="text-sm text-blue-600 hover:underline py-2"
            >
              Review Queue →
            </Link>
          </div>
        </div>
      </div>

      <LabDashboardClient initialTab={initialTab} />
    </div>
  );
}
