import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import AppointmentsClient from '@/components/fitness/AppointmentsClient';
import PersonSwitcher from '@/components/health/PersonSwitcher';
import { activePerson } from '@/lib/health/people';

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { person, people } = await activePerson(supabase, user.id);

  // Rows written before the person column existed have person_id null; they
  // belong to the account holder, so include them when viewing self.
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .order('appointment_date', { ascending: false });
  if (person) {
    query = person.is_self
      ? query.or(`person_id.eq.${person.id},person_id.is.null`)
      : query.eq('person_id', person.id);
  }
  const { data: appointments } = await query;

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">Doctor visits — prep, notes, medication changes.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <PersonSwitcher people={people} activeId={person?.id ?? null} />
      <AppointmentsClient appointments={appointments ?? []} />
    </main>
  );
}
