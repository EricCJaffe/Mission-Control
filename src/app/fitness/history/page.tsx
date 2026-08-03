import Link from 'next/link';
import { Upload } from 'lucide-react';
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

  // Recovery sessions belong in the same log. They were only visible inside the
  // recovery module, so the training history read as if sauna, cold plunge and
  // mobility work never happened — despite counting toward mobility in the
  // training balance.
  const { data: recovery } = await supabase
    .from('recovery_sessions')
    .select('id, session_date, modality, duration_min, timing_context, perceived_recovery, notes')
    .eq('user_id', user.id)
    .order('session_date', { ascending: false })
    .limit(100);

  const MODALITY_LABEL: Record<string, string> = {
    sauna: 'Sauna',
    cold_plunge: 'Cold plunge',
    stretching: 'Stretching',
    mobility: 'Mobility',
    massage: 'Massage',
    compression: 'Leg compression',
  };

  const recoveryRows = (recovery ?? []).map((r) => ({
    id: r.id,
    // Date-only in the table; noon keeps it on the right day in any timezone.
    workout_date: `${r.session_date}T12:00:00Z`,
    workout_type: MODALITY_LABEL[r.modality] ?? r.modality,
    duration_minutes: r.duration_min,
    tss: null,
    compliance_pct: null,
    compliance_color: null,
    rpe_session: null,
    notes: r.notes,
    ai_summary: null,
    source: 'recovery',
    strain_score: null,
    avg_hr: null,
    max_hr: null,
    template_id: null,
    template_name: null,
    is_recovery: true,
    perceived_recovery: r.perceived_recovery,
    timing_context: r.timing_context,
  }));

  const enriched = [
    ...(workouts ?? []).map(w => ({
      ...w,
      template_name: w.template_id ? templateMap[w.template_id] ?? null : null,
      is_recovery: false,
    })),
    ...recoveryRows,
  ].sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)));

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Workout History</h1>
          <p className="mt-1 text-sm text-slate-500">All logged workouts with details, stats, and trends.</p>
        </div>
        <Link
          href="/fitness/history/import"
          className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors shrink-0"
        >
          <Upload className="w-4 h-4" />
          Import Strong
        </Link>
      </div>
      <WorkoutHistoryClient workouts={enriched} />
    </main>
  );
}
