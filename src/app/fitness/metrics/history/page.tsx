/**
 * Metrics History Page
 *
 * Comprehensive view of all body metrics with filtering, sorting, and drill-down
 * Similar to labs history page with all-time data
 */

import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MetricsHistoryClient from '@/components/fitness/MetricsHistoryClient';

export const metadata = {
  title: 'Metrics History | Mission Control',
  description: 'Historical body metrics tracking',
};

export default async function MetricsHistoryPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch ALL metrics (no date filter - all-time data)
  const { data: metrics, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: false });

  if (error) {
    console.error('Error fetching metrics:', error);
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Metrics History</h1>
        <p className="text-slate-600">
          All-time body metrics tracking with filtering and analysis
        </p>
      </div>

      <MetricsHistoryClient metrics={metrics || []} />
    </div>
  );
}
