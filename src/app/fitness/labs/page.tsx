import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Redirect to comprehensive labs dashboard
export default async function LabResultsPage() {
  redirect('/fitness/health/labs/dashboard');
}
