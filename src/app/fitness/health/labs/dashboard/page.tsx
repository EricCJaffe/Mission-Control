import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LabDashboardClient from '@/components/fitness/LabDashboardClient';

export const dynamic = 'force-dynamic';

export default async function LabDashboardPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Lab Results Dashboard</h1>
          <a
            href="/fitness/health/labs"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Lab Review
          </a>
        </div>
        <p className="text-gray-600">
          Comprehensive analysis of your lab results over time with trend visualization and AI insights.
        </p>
      </div>

      <LabDashboardClient userId={userData.user.id} />
    </div>
  );
}
