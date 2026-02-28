/**
 * Metrics Trends Page - Redirects to main Trends page
 * This page is redundant with /fitness/trends which has more comprehensive data
 */

import { redirect } from 'next/navigation';

export default function MetricsTrendsPage() {
  redirect('/fitness/trends');
}
