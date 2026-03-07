import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { sumNutrition } from '@/lib/fitness/nutrition';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [{ data: logs }, { data: target }, { data: workouts }, { data: recentLabs }] = await Promise.all([
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: true }),
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes')
      .eq('user_id', user.id)
      .gte('workout_date', sevenDaysAgo.toISOString())
      .order('workout_date', { ascending: true }),
    supabase
      .from('lab_results')
      .select('test_name, normalized_test_name, value, unit, flag, created_at')
      .eq('user_id', user.id)
      .in('normalized_test_name', ['egfr', 'creatinine', 'ldl cholesterol', 'hdl cholesterol', 'triglycerides'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const totals = sumNutrition(logs || []);

  const system = await buildAISystemPrompt(user.id, 'nutrition_advice');
  const userPrompt = `Provide a weekly nutrition summary for a cardiac + mild CKD user.

Targets:
${JSON.stringify(target || {}, null, 2)}

Nutrition logs:
${JSON.stringify(logs || [], null, 2)}

Weekly totals:
${JSON.stringify(totals, null, 2)}

Recent workouts:
${JSON.stringify(workouts || [], null, 2)}

Recent labs:
${JSON.stringify(recentLabs || [], null, 2)}

Return valid JSON only:
{
  "summary": "2 short paragraphs",
  "wins": ["3-5 wins"],
  "risks": ["2-5 risks"],
  "next_actions": ["3-6 actions"],
  "food_focus": ["3-5 foods or patterns to emphasize"],
  "doctor_topics": ["0-3 items for next doctor visit if relevant"]
}`;

  const raw = await callOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    system,
    user: userPrompt,
  });

  return NextResponse.json({ ok: true, insights: { ...parseJson(raw), totals } });
}

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
