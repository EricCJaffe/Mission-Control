import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fitness/fasting/ai-advice
 *
 * Provides AI-powered fasting window recommendations based on:
 * - Historical fasting patterns
 * - Upcoming workout schedule
 * - Current readiness and recovery status
 * - Medication timing (from health context)
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Fetch recent fasting history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: fastingLogs } = await supabase
      .from('fasting_logs')
      .select('fast_start, fast_end, actual_hours, target_hours, workout_during_fast, energy_level')
      .eq('user_id', user.id)
      .gte('fast_start', thirtyDaysAgo.toISOString())
      .not('fast_end', 'is', null)
      .order('fast_start', { ascending: false })
      .limit(30);

    // Fetch upcoming planned workouts (next 7 days)
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: upcomingWorkouts } = await supabase
      .from('planned_workouts')
      .select('scheduled_date, day_label, workout_type, prescribed')
      .eq('user_id', user.id)
      .gte('scheduled_date', today)
      .lte('scheduled_date', sevenDaysFromNow.toISOString().slice(0, 10))
      .order('scheduled_date');

    // Fetch recent readiness
    const { data: readiness } = await supabase
      .from('daily_readiness')
      .select('readiness_score, recommendation')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch current active fast (if any)
    const { data: activeFast } = await supabase
      .from('fasting_logs')
      .select('fast_start, target_hours')
      .eq('user_id', user.id)
      .is('fast_end', null)
      .maybeSingle();

    // Build AI system prompt with health context
    const systemPrompt = await buildAISystemPrompt(user.id, 'fasting_advisor');

    // Calculate fasting statistics
    const completedFasts = fastingLogs || [];
    const avgHours = completedFasts.length > 0
      ? completedFasts.reduce((sum, log) => sum + (log.actual_hours || 0), 0) / completedFasts.length
      : 0;
    const successRate = completedFasts.length > 0
      ? (completedFasts.filter(log => (log.actual_hours || 0) >= (log.target_hours || 16)).length / completedFasts.length) * 100
      : 0;

    const userPrompt = `Provide personalized fasting window advice.

CURRENT STATUS:
${activeFast ? `Currently fasting (started ${new Date(activeFast.fast_start).toLocaleString()}, target ${activeFast.target_hours}h)` : 'Not currently fasting'}

FASTING HISTORY (last 30 days):
- Total fasts: ${completedFasts.length}
- Average window: ${avgHours.toFixed(1)} hours
- Success rate: ${successRate.toFixed(0)}% (hitting target)
${completedFasts.slice(0, 5).map(log =>
  `  • ${new Date(log.fast_start).toLocaleDateString()}: ${log.actual_hours?.toFixed(1)}h${log.workout_during_fast ? ' (workout during fast)' : ''}`
).join('\n')}

UPCOMING WORKOUTS:
${upcomingWorkouts && upcomingWorkouts.length > 0
  ? upcomingWorkouts.map(w => `- ${new Date(w.scheduled_date).toLocaleDateString()}: ${w.day_label || w.workout_type}`).join('\n')
  : 'No workouts planned'}

CURRENT READINESS:
${readiness ? `${readiness.readiness_score}/100 - ${readiness.recommendation}` : 'Unknown'}

Based on my health profile (medications, cardiac status, workout schedule), provide:
1. **Optimal fasting window** for this week (start/end times)
2. **Workout timing** recommendations (fasted vs fed training for each session)
3. **Breaking fast** suggestions (what to eat first based on medication timing)
4. **Adjustments** based on readiness/recovery status

Keep it concise and actionable (3-4 short paragraphs).`;

    const result = await callOpenAI({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      system: systemPrompt,
      user: userPrompt,
    });

    return NextResponse.json({ ok: true, advice: result });
  } catch (error) {
    console.error('Error generating fasting advice:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate advice' },
      { status: 500 }
    );
  }
}
