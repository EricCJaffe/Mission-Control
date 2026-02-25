import { supabaseServer } from '@/lib/supabase/server';
import AthleteProfileClient from '@/components/fitness/AthleteProfileClient';

export const dynamic = 'force-dynamic';

export default async function AthleteSettingsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Athlete Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configure zones, FTP, medication schedule, goals, and baselines.</p>
      </div>
      <AthleteProfileClient profile={profile} />
    </main>
  );
}
