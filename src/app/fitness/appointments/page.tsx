import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import AppointmentsClient from '@/components/fitness/AppointmentsClient';

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('appointment_date', { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">Doctor visits — prep, notes, medication changes.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <AppointmentsClient appointments={appointments ?? []} />
    </main>
  );
}
