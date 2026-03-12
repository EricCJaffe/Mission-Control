import { supabaseServer } from '@/lib/supabase/server';
import AthleteProfileClient from '@/components/fitness/AthleteProfileClient';
import Link from 'next/link';
import { Download, Activity, Watch, Settings2 } from 'lucide-react';

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
              <h3 className="font-semibold text-slate-800">Withings Sync</h3>
              <p className="text-sm text-slate-500">Connect or import BP, weight, body composition, sleep, and daily health metrics</p>
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

          {/* Apple Health */}
          <Link
            href="/fitness/settings/apple-health"
            className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-pink-300 hover:bg-pink-50/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
              <Watch className="h-6 w-6 text-pink-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">Apple Health Import</h3>
              <p className="text-sm text-slate-500">Import workouts, sleep, and daily metrics from Apple Watch via Health Auto Export</p>
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
          {/* Source Preferences */}
          <Link
            href="/fitness/settings/apple-health"
            className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 hover:border-violet-300 hover:bg-violet-50/50 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
              <Settings2 className="h-6 w-6 text-violet-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">Source Preferences</h3>
              <p className="text-sm text-slate-500">Choose preferred data source per metric category when using multiple devices</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Athlete Profile */}
      <AthleteProfileClient profile={profile} />
    </main>
  );
}
