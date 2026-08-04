import { supabaseServer } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import WorkoutDetailClient from '@/components/fitness/WorkoutDetailClient';
import RouteMap from '@/components/fitness/RouteMap';
import RunBreakdown from '@/components/fitness/RunBreakdown';
import { analyseRun } from '@/lib/fitness/run-analysis';
import HeartRateZones from '@/components/fitness/HeartRateZones';
import { analyseSessionZones } from '@/lib/fitness/hr-zone-analysis';
import { calculateSeasonalHRZones } from '@/lib/fitness/hr-zones';
import type { HRZones } from '@/lib/fitness/types';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function WorkoutDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // Fetch workout log
  const { data: workout, error: workoutError } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (workoutError || !workout) notFound();

  // Fetch all sets for this workout
  const { data: sets, error: setsError } = await supabase
    .from('set_logs')
    .select(`
      *,
      exercises(id, name, category, equipment)
    `)
    .eq('workout_log_id', id)
    .order('id');

  if (setsError) {
    console.error('Error fetching sets:', setsError);
  }

  // Fetch cardio data unconditionally. This used to be gated on
  // workout_type being 'cardio' or 'hybrid', which silently hid it for every
  // Apple Health workout — those arrive typed 'Outdoor Run', 'Indoor Cycling'
  // and so on, and do carry heart rate and distance.
  const { data: cardioData } = await supabase
    .from('cardio_logs')
    .select('*')
    .eq('workout_log_id', id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from('athlete_profile')
    .select('hr_zones, max_hr_ceiling')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: cardio } = await supabase
    .from('cardio_logs')
    .select('avg_hr, max_hr, min_hr, distance_miles, activity_type')
    .eq('workout_log_id', id)
    .maybeSingle();

  // GPS trace, present only for outdoor workouts.
  const { data: route } = await supabase
    .from('workout_routes')
    .select('points, elevation_gain_m, elevation_loss_m')
    .eq('workout_log_id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  // Everything below the map is derived from the same GPS trace — splits,
  // run/walk segmentation, elevation. No extra ingestion, just arithmetic on
  // points that were already being stored and only ever drawn.
  const runAnalysis = route?.points?.length ? analyseRun(route.points) : null;

  const hrZones = (profile?.hr_zones ?? null) as HRZones | null;
  const ceiling = Number(profile?.max_hr_ceiling ?? 155);
  const seasonal = calculateSeasonalHRZones(ceiling, new Date(workout.workout_date).getMonth());
  const zoneAnalysis =
    hrZones && (cardio?.avg_hr != null || workout.avg_hr != null)
      ? analyseSessionZones(
          {
            avg_hr: cardio?.avg_hr ?? workout.avg_hr ?? null,
            max_hr: cardio?.max_hr ?? workout.max_hr ?? null,
            min_hr: cardio?.min_hr ?? null,
          },
          hrZones,
          { ceiling, effectiveCeiling: seasonal.effectiveMaxHR },
        )
      : null;

  return (
    <div className="space-y-4">
      {route?.points?.length ? (
        <RouteMap
          points={route.points}
          elevationGainM={route.elevation_gain_m}
          elevationLossM={route.elevation_loss_m}
        />
      ) : null}
      {zoneAnalysis && hrZones && (
        <HeartRateZones
          analysis={zoneAnalysis}
          zones={hrZones}
          seasonalNote={
            seasonal.seasonal.adjustment_bpm !== 0
              ? `Ceiling adjusted ${seasonal.seasonal.adjustment_bpm} bpm for ${seasonal.seasonal.label} — ${seasonal.seasonal.reason}.`
              : null
          }
        />
      )}
      {runAnalysis && (
        <RunBreakdown analysis={runAnalysis} />
      )}
      <WorkoutDetailClient
        workout={workout}
        sets={sets || []}
        cardioData={cardioData}
      />
    </div>
  );
}
