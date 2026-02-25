import { supabaseServer } from '@/lib/supabase/server';
import WorkoutHistoryClient from '@/components/fitness/WorkoutHistoryClient';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: workouts } = await supabase
    .from('workout_logs')
    .select('id, workout_date, workout_type, duration_minutes, tss, compliance_pct, compliance_color, rpe_session, notes, ai_summary, source, strain_score, avg_hr, max_hr, template_id')
    .eq('user_id', user.id)
    .order('workout_date', { ascending: false })
    .limit(100);

  // Fetch template names for workouts that reference templates
  const templateIds = [...new Set((workouts ?? []).filter(w => w.template_id).map(w => w.template_id))];
  let templateMap: Record<string, string> = {};

  if (templateIds.length > 0) {
    const { data: templates } = await supabase
      .from('workout_templates')
      .select('id, name')
      .in('id', templateIds);
    if (templates) {
      templateMap = Object.fromEntries(templates.map(t => [t.id, t.name]));
    }
  }

  const enriched = (workouts ?? []).map(w => ({
    ...w,
    template_name: w.template_id ? templateMap[w.template_id] ?? null : null,
  }));

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Workout History</h1>
        <p className="mt-1 text-sm text-slate-500">All logged workouts with details, stats, and trends.</p>
      </div>
      <WorkoutHistoryClient workouts={enriched} />
    </main>
  );
}
