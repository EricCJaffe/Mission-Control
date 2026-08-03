import { supabaseServer } from '@/lib/supabase/server';
import { HeartPulse } from 'lucide-react';
import TrendSparkline, { type TrendPoint } from '@/components/fitness/TrendSparkline';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mobility & Running | Fitness' };

type MobilityRow = {
  metric_date: string;
  walking_asymmetry_pct: number | null;
  double_support_pct: number | null;
  walking_speed_mph: number | null;
  step_length_in: number | null;
  walking_hr_avg: number | null;
  six_minute_walk_m: number | null;
  cardio_recovery_bpm: number | null;
};

type RunningRow = {
  metric_date: string;
  ground_contact_ms: number | null;
  stride_length_m: number | null;
  vertical_oscillation_cm: number | null;
  power_watts: number | null;
  speed_mph: number | null;
};

const series = <T extends { metric_date: string }>(rows: T[], key: keyof T): TrendPoint[] =>
  rows.map((r) => ({ date: r.metric_date, value: (r[key] as number | null) ?? null }));

export default async function MobilityPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: mobility }, { data: running }] = await Promise.all([
    supabase
      .from('mobility_metrics')
      .select('metric_date, walking_asymmetry_pct, double_support_pct, walking_speed_mph, step_length_in, walking_hr_avg, six_minute_walk_m, cardio_recovery_bpm')
      .eq('user_id', user.id)
      .order('metric_date'),
    supabase
      .from('running_dynamics')
      .select('metric_date, ground_contact_ms, stride_length_m, vertical_oscillation_cm, power_watts, speed_mph')
      .eq('user_id', user.id)
      .order('metric_date'),
  ]);

  const m = (mobility ?? []) as MobilityRow[];
  const r = (running ?? []) as RunningRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-1">
      <div>
        <h1 className="text-3xl font-semibold">Mobility &amp; Running</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gait and running-form measures from Apple Health. These matter as trends, not
          single readings.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Gait &amp; mobility
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TrendSparkline
            label="Walking asymmetry"
            unit="%"
            points={series(m, 'walking_asymmetry_pct')}
            lowerIsBetter
            bands={{ good: 3, watch: 5 }}
            hint="Share of walking time where left and right steps differ. Under 3% is typical; a sustained rise often tracks pain or injury on one side."
          />
          <TrendSparkline
            label="Double support"
            unit="%"
            points={series(m, 'double_support_pct')}
            lowerIsBetter
            bands={{ good: 30, watch: 34 }}
            hint="Time with both feet on the ground. It climbs when balance or confidence in the stride drops."
          />
          <TrendSparkline
            label="Walking speed"
            unit="mph"
            points={series(m, 'walking_speed_mph')}
            bands={{ good: 2.8, watch: 2.4 }}
            precision={2}
            hint="One of the better general-health proxies in the literature — it tends to fall before other measures do."
          />
          <TrendSparkline
            label="Step length"
            unit="in"
            points={series(m, 'step_length_in')}
            precision={1}
            hint="Shortens with fatigue, stiffness or caution."
          />
          <TrendSparkline
            label="Walking heart rate"
            unit="bpm"
            points={series(m, 'walking_hr_avg')}
            lowerIsBetter
            precision={0}
            hint="Average HR while walking. Falling at the same walking speed suggests improving aerobic fitness."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Running form
        </h2>
        {r.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No running dynamics yet — these only appear on outdoor runs with the watch.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TrendSparkline
              label="Ground contact time"
              unit="ms"
              points={series(r, 'ground_contact_ms')}
              lowerIsBetter
              precision={0}
              hint="How long each foot stays down. Shorter generally means a more efficient stride."
            />
            <TrendSparkline
              label="Stride length"
              unit="m"
              points={series(r, 'stride_length_m')}
              precision={2}
              hint="Longer at the same cadence means more speed for the same effort."
            />
            <TrendSparkline
              label="Vertical oscillation"
              unit="cm"
              points={series(r, 'vertical_oscillation_cm')}
              lowerIsBetter
              precision={1}
              hint="How much you bounce. Energy spent going up is energy not spent going forward."
            />
            <TrendSparkline
              label="Running power"
              unit="W"
              points={series(r, 'power_watts')}
              precision={0}
              hint="Work rate while running, independent of terrain and wind."
            />
            <TrendSparkline
              label="Running speed"
              unit="mph"
              points={series(r, 'speed_mph')}
              precision={2}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          <HeartPulse className="h-4 w-4 text-rose-600" />
          Cardiac function markers
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TrendSparkline
            label="6-minute walk distance"
            unit="m"
            points={series(m, 'six_minute_walk_m')}
            bands={{ good: 450, watch: 350 }}
            precision={0}
            hint="How far you could walk on the flat in six minutes — a standard measure of functional cardiac capacity. Healthy adults manage roughly 550-650 m."
          />
          <TrendSparkline
            label="HR recovery (1 min)"
            unit="bpm"
            points={series(m, 'cardio_recovery_bpm')}
            bands={{ good: 20, watch: 13 }}
            precision={0}
            hint="How far heart rate falls in the first minute after hard effort, as the parasympathetic system takes back over. Beta-blockers blunt this, so expect a lower number than an untreated person would post."
          />
        </div>
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          These two differ from everything above: both are used clinically in cardiac
          assessment, and the thresholds come from outcome literature rather than athletic
          convention — six-minute walk distance under about 300 m, and a one-minute heart-rate
          recovery of 12 bpm or less, are the figures that appear in it. Apple <em>estimates</em>{' '}
          both from ordinary walking rather than administering the real tests, so the direction
          they move is worth far more than any single reading. Worth showing Dr. Chandler; not
          worth drawing conclusions from alone.
        </p>
      </section>

      <p className="text-xs text-slate-400">
        {m.length} days of gait data · {r.length} runs with form data. Both arrive
        automatically from Apple Health.
      </p>
    </div>
  );
}
