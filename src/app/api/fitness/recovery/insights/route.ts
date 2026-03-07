import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { summarizeRecoverySessions } from '@/lib/fitness/recovery-modalities';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [{ data: sessions }, { data: metrics }, { data: workouts }] = await Promise.all([
    supabase
      .from('recovery_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('session_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('session_date', { ascending: true }),
    supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, sleep_score, body_battery, weight_lbs')
      .eq('user_id', user.id)
      .gte('metric_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('metric_date', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes, strain_score, rpe_session')
      .eq('user_id', user.id)
      .gte('workout_date', fourteenDaysAgo.toISOString())
      .order('workout_date', { ascending: true }),
  ]);

  const sessionRows = (sessions || []).map((session) => ({
    ...session,
    duration_min: Number(session.duration_min || 0),
  }));
  const summary = summarizeRecoverySessions(sessionRows);
  const system = await buildAISystemPrompt(user.id, 'recovery_advice');
  const userPrompt = `Analyze recovery-modality usage for a cardiac + mild CKD user.

Recovery sessions:
${JSON.stringify(sessionRows, null, 2)}

Summary:
${JSON.stringify(summary, null, 2)}

Recent body metrics:
${JSON.stringify(metrics || [], null, 2)}

Recent workouts:
${JSON.stringify(workouts || [], null, 2)}

Return valid JSON only:
{
  "summary": "2 short paragraphs on how recovery work is supporting or missing from the plan",
  "priorities": ["2-4 actions"],
  "warnings": ["0-3 watchouts"],
  "modality_observations": ["3-5 observations about sauna/cold/stretching/mobility patterns"],
  "next_step": "1 sentence recommendation for the next 24-48h"
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user: userPrompt,
  });

  return NextResponse.json({
    ok: true,
    insights: {
      ...parseJson(raw),
      computed: summary,
    },
  });
}

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
