import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import HealthCommandCenterClient from '@/components/fitness/HealthCommandCenterClient';

export const dynamic = 'force-dynamic';

export default async function HealthCommandCenterPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  return (
    <main className="p-4 sm:p-6 max-w-7xl mx-auto">
      <HealthCommandCenterClient />
    </main>
  );
}
