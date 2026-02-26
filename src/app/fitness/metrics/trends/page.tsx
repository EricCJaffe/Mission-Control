/**
 * Metrics Trends Page
 *
 * Visual trending analysis with charts for all body metrics
 */

import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MetricsTrendsClient from '@/components/fitness/MetricsTrendsClient';

export const metadata = {
  title: 'Metrics Trends | Mission Control',
  description: 'Visual trending analysis for body metrics',
};

export default async function MetricsTrendsPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch metrics for trending (last 90 days by default, but client can filter)
  const { data: metrics, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: true }); // Ascending for charts

  if (error) {
    console.error('Error fetching metrics:', error);
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Metrics Trends</h1>
        <p className="text-slate-600">
          Visual analysis of body metrics over time with trend detection
        </p>
      </div>

      <MetricsTrendsClient metrics={metrics || []} />
    </div>
  );
}
