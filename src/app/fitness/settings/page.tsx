import { supabaseServer } from '@/lib/supabase/server';
import AthleteProfileClient from '@/components/fitness/AthleteProfileClient';
import Link from 'next/link';
import { Download, Activity } from 'lucide-react';

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

      {/* Data Import Section */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Data Imports</h2>
        <div className="space-y-3">
          {/* Withings */}
          <Link
            href="/fitness/settings/withings"
            className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Download className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">Withings Import</h3>
              <p className="text-sm text-slate-500">Import BP, weight, body composition from Health Mate export</p>
            </div>
          </Link>

          {/* Garmin Mass Import */}
          <Link
            href="/fitness/settings/garmin/mass-import"
            className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-green-300 hover:bg-green-50/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">Garmin Mass Import</h3>
              <p className="text-sm text-slate-500">Bulk import historical workouts, sleep, and wellness data</p>
            </div>
          </Link>

          {/* Garmin FIT Import */}
          <Link
            href="/fitness/settings/garmin/import"
            className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-green-300 hover:bg-green-50/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">Garmin FIT Import</h3>
              <p className="text-sm text-slate-500">Upload individual FIT files for daily sync</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Athlete Profile */}
      <AthleteProfileClient profile={profile} />
    </main>
  );
}
