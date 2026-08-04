import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import FitnessTrendsClient from '@/components/fitness/FitnessTrendsClient';
import BodyCompositionDashboardClient from '@/components/fitness/BodyCompositionDashboardClient';
import BPDashboardClient from '@/components/fitness/BPDashboardClient';
import SleepDashboardClient from '@/components/fitness/SleepDashboardClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Body | Fitness' };

/**
 * One page for everything measured about the body.
 *
 * Trends, body composition, blood pressure and sleep were four top-level tabs
 * showing four views of the same question — how are the numbers moving. That
 * put eight tabs across the top of the fitness area, which on a phone is a
 * horizontal scroll of chips where half of them are variations on "look at a
 * chart".
 *
 * They are one tab now with a view selector. The existing dashboards are
 * unchanged and still receive exactly the data they did before; only the
 * navigation around them moved, and only the active view is fetched so this
 * costs no more than the individual pages did.
 */

/** 'YYYY-MM-DD', N days back. Kept out of the render path. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const VIEWS = [
  { key: 'trends', label: 'Trends' },
  { key: 'composition', label: 'Body Comp' },
  { key: 'bp', label: 'Blood Pressure' },
  { key: 'sleep', label: 'Sleep' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function BodyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: ViewKey = (VIEWS.find((v) => v.key === params.view)?.key ?? 'trends') as ViewKey;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Body</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything measured — trends, composition, blood pressure and sleep.
        </p>
      </div>

      {/* Scrolls rather than wrapping, so the row stays one line on a phone. */}
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/fitness/body?view=${v.key}`}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              view === v.key
                ? 'bg-blue-700 text-white'
                : 'border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {/* Only the active view is queried. */}
      {view === 'trends' && <TrendsView userId={user.id} />}
      {view === 'composition' && <CompositionView userId={user.id} />}
      {view === 'bp' && <BPView userId={user.id} />}
      {view === 'sleep' && <SleepView userId={user.id} />}
    </main>
  );
}

async function TrendsView({ userId }: { userId: string }) {
  const supabase = await supabaseServer();
  const since = daysAgoIso(180);

  const [{ data: bodyMetrics }, { data: bpReadings }, { data: workoutLogs }, { data: formHistory }] =
    await Promise.all([
    supabase
      .from('body_metrics')
      .select(
        'metric_date, resting_hr, hrv_ms, body_battery, weight_lbs, body_fat_pct, muscle_mass_lbs, bone_mass_lbs, hydration_lbs, sleep_score, vo2_max'
      )
      .eq('user_id', userId)
      .gte('metric_date', since)
      .order('metric_date', { ascending: true }),
    supabase
      .from('bp_readings')
      .select('reading_date, systolic, diastolic, pulse, flag_level')
      .eq('user_id', userId)
      .gte('reading_date', `${since}T00:00:00`)
      .order('reading_date', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes, tss, compliance_color, rpe_session')
      .eq('user_id', userId)
      .gte('workout_date', `${since}T00:00:00`)
      .order('workout_date', { ascending: true }),
    supabase
      .from('fitness_form')
      .select('calc_date, fitness_ctl, fatigue_atl, form_tsb, form_status, daily_tss')
      .eq('user_id', userId)
      .gte('calc_date', since)
      .order('calc_date', { ascending: true }),
  ]);

  return (
    <FitnessTrendsClient
      bodyMetrics={bodyMetrics ?? []}
      bpReadings={bpReadings ?? []}
      workoutLogs={workoutLogs ?? []}
      formHistory={formHistory ?? []}
    />
  );
}

async function CompositionView({ userId }: { userId: string }) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('body_metrics')
    .select('metric_date, weight_lbs, body_fat_pct, muscle_mass_lbs, bone_mass_lbs, hydration_lbs')
    .eq('user_id', userId)
    .order('metric_date', { ascending: true });

  return <BodyCompositionDashboardClient metrics={data ?? []} />;
}

async function BPView({ userId }: { userId: string }) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('bp_readings')
    .select(
      'id, reading_date, systolic, diastolic, pulse, flag_level, position, arm, time_of_day, pre_or_post_meds, pre_or_post_workout, notes'
    )
    .eq('user_id', userId)
    .order('reading_date', { ascending: false })
    .limit(90);

  return <BPDashboardClient readings={data ?? []} />;
}

async function SleepView({ userId }: { userId: string }) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('user_id', userId)
    .order('sleep_date', { ascending: false })
    .limit(90);

  return <SleepDashboardClient sleepLogs={data ?? []} />;
}
