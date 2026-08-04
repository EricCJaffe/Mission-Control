import { FlaskConical, Pill, CalendarCheck, Dna, FileHeart, Activity, Scan, Droplets } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import SectionHub from '@/components/fitness/SectionHub';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Health | Fitness' };

export default async function HealthOverviewPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ count: labs }, { count: meds }, { count: appts }, { data: doc }, { count: pending }] =
    await Promise.all([
      supabase.from('lab_panels').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('medications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'scheduled'),
      supabase.from('health_documents').select('version').eq('user_id', user.id).eq('is_current', true).maybeSingle(),
      supabase.from('health_doc_pending_updates').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending'),
    ]);

  return (
    <SectionHub
      title="Health"
      subtitle="The clinical picture — labs, medications, appointments and the record behind them."
      cards={[
        { href: '/fitness/health/labs/dashboard', title: 'Labs', body: 'Panels over time, with reference ranges.', icon: <FlaskConical className="h-5 w-5 text-blue-700" />, meta: `${labs ?? 0} panels` },
        { href: '/fitness/medications', title: 'Medications', body: 'What you take, when, and interaction checks.', icon: <Pill className="h-5 w-5 text-slate-600" />, meta: `${meds ?? 0} active` },
        { href: '/fitness/appointments', title: 'Appointments', body: 'Upcoming visits and cardiologist prep.', icon: <CalendarCheck className="h-5 w-5 text-slate-600" />, meta: `${appts ?? 0} scheduled` },
        { href: '/fitness/health/view', title: 'health.md', body: 'Medical history, surgeries, constraints. Drives planning.', icon: <FileHeart className="h-5 w-5 text-slate-600" />, meta: doc ? `v${doc.version}${pending ? ` · ${pending} awaiting review` : ''}` : 'Not initialised' },
        { href: '/fitness/health/command-center', title: 'Command centre', body: 'Everything the AI sees, in one analysis.', icon: <Activity className="h-5 w-5 text-slate-600" /> },
        { href: '/fitness/genetics', title: 'Genetics', body: 'Reports and the comprehensive synthesis.', icon: <Dna className="h-5 w-5 text-slate-600" /> },
        { href: '/fitness/health/imaging', title: 'Imaging', body: 'MRI, cath and scan reports.', icon: <Scan className="h-5 w-5 text-slate-600" /> },
        { href: '/fitness/hydration', title: 'Hydration & nutrition', body: 'Intake tracking and fasting windows.', icon: <Droplets className="h-5 w-5 text-slate-600" /> },
      ]}
    />
  );
}
