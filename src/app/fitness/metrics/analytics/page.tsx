/**
 * Metrics AI Analytics Page
 *
 * AI-powered analysis of body metrics for correlations, trends, and warnings
 */

import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MetricsAnalyticsClient from '@/components/fitness/MetricsAnalyticsClient';

export const metadata = {
  title: 'Metrics AI Analytics | Mission Control',
  description: 'AI-powered health metrics analysis',
};

export default async function MetricsAnalyticsPage() {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Metrics Analytics</h1>
        <p className="text-slate-600">
          AI-powered analysis of correlations, trends, and early warning signs
        </p>
      </div>

      <MetricsAnalyticsClient />
    </div>
  );
}
