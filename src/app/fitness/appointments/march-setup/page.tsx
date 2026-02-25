import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MarchAppointmentSetupClient from '@/components/fitness/MarchAppointmentSetupClient';

export const dynamic = 'force-dynamic';

export default async function MarchAppointmentSetupPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Check if March 13 appointment exists
  const { data: marchAppointment } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('appointment_date', '2026-03-13')
    .single();

  // Check if health.md exists
  const { data: healthDoc } = await supabase
    .from('health_documents')
    .select('id, version')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

  // Check if medications are seeded
  const { count: medsCount } = await supabase
    .from('medications')
    .select('id', { count: 'exact' })
    .eq('user_id', userData.user.id);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">March 13, 2026 Appointment Setup</h1>
        <p className="text-gray-600">
          Quick setup for your cardiologist appointment. This will create the appointment and generate AI-powered prep questions.
        </p>
      </div>

      <MarchAppointmentSetupClient
        appointmentExists={!!marchAppointment}
        appointment={marchAppointment}
        healthDocExists={!!healthDoc}
        medsCount={medsCount || 0}
      />
    </div>
  );
}
