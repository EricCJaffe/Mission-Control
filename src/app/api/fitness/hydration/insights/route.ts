import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { summarizeHydrationRisk } from '@/lib/fitness/hydration';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [{ data: logs }, { data: target }, { data: metrics }, { data: labRows }, { data: workouts }] = await Promise.all([
    supabase
      .from('hydration_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('log_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('log_date', { ascending: true }),
    supabase
      .from('hydration_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('body_metrics')
      .select('metric_date, weight_lbs, resting_hr')
      .eq('user_id', user.id)
      .gte('metric_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('metric_date', { ascending: true }),
    supabase
      .from('lab_results')
      .select('normalized_test_name, value, unit, created_at')
      .eq('user_id', user.id)
      .in('normalized_test_name', ['creatinine', 'egfr', 'hematocrit'])
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes')
      .eq('user_id', user.id)
      .gte('workout_date', fourteenDaysAgo.toISOString())
      .order('workout_date', { ascending: true }),
  ]);

  const todayLog = logs?.[logs.length - 1];
  const todayMetric = metrics?.[metrics.length - 1];
  const baselineWeight = metrics && metrics.length > 2 ? Number(metrics[Math.max(0, metrics.length - 3)].weight_lbs || 0) : null;
  const todayTarget = Number(target?.base_target_oz || 96);

  const risk = summarizeHydrationRisk({
    todayIntakeOz: Number(todayLog?.intake_oz || 0),
    todayOutputOz: Number(todayLog?.output_oz || 0),
    targetOz: todayTarget,
    latestWeightLbs: todayMetric?.weight_lbs ?? null,
    baselineWeightLbs: baselineWeight,
    alertWeightGainLbs: Number(target?.alert_weight_gain_lbs || 2),
  });

  const system = await buildAISystemPrompt(user.id, 'hydration_advice');
  const userPrompt = `Analyze hydration trends for a cardiac + mild CKD user.

Hydration target:
${JSON.stringify(target || { base_target_oz: 96, min_target_oz: 85, max_target_oz: 128 }, null, 2)}

Recent hydration logs:
${JSON.stringify(logs || [], null, 2)}

Recent body metrics:
${JSON.stringify(metrics || [], null, 2)}

Recent labs:
${JSON.stringify(labRows || [], null, 2)}

Recent workouts:
${JSON.stringify(workouts || [], null, 2)}

Return valid JSON only:
{
  "summary": "2-3 short paragraphs",
  "alerts": ["0-4 alerts"],
  "electrolyte_suggestion": "Post-workout electrolyte suggestion, including sodium range when appropriate",
  "education": ["3-5 short bullets on HF/CKD hydration"],
  "reminders": ["2-4 reminder ideas"],
  "trend_calls": ["3-5 concrete observations tied to logs/labs/workouts"]
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user: userPrompt,
  });

  const insights = parseJson(raw);
  const alerts = Array.isArray(insights.alerts) ? insights.alerts.map(String) : [];
  if (risk.weightGainAlert) {
    alerts.unshift(`Weight gain alert: up ${risk.weightGainLbs?.toFixed(1)} lbs versus recent baseline.`);
  }
  if (risk.deficitOz > 24) {
    alerts.unshift(`Hydration deficit: ${risk.deficitOz.toFixed(0)} oz below target.`);
  }

  return NextResponse.json({
    ok: true,
    insights: {
      ...insights,
      alerts,
      computed: risk,
    },
  });
}

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
