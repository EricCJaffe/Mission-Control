import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const goal = typeof body.goal === 'string' ? body.goal : 'general health';

    const [{ data: target }, { data: foodLogs }, { data: recentLabs }, { data: metrics }, geneticsResult] = await Promise.all([
      supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(12),
      supabase
        .from('lab_results')
        .select('test_name, normalized_test_name, value, unit, flag, created_at')
        .eq('user_id', user.id)
        .in('normalized_test_name', ['egfr', 'creatinine', 'ldl cholesterol', 'hdl cholesterol', 'triglycerides', 'hemoglobin a1c'])
        .order('created_at', { ascending: false })
        .limit(24),
      supabase
        .from('body_metrics')
        .select('metric_date, weight_lbs, body_fat_pct, resting_hr')
        .eq('user_id', user.id)
        .order('metric_date', { ascending: false })
        .limit(7),
      supabase.rpc('get_genetics_comprehensive_analysis', { p_user_id: user.id }),
    ]);

    const system = await buildAISystemPrompt(user.id, 'nutrition_advice');
    const userPrompt = `Create cardiac-aware and kidney-aware meal suggestions.

Goal:
${goal}

Nutrition targets:
${JSON.stringify(target || {}, null, 2)}

Recent nutrition logs:
${JSON.stringify(foodLogs || [], null, 2)}

Recent metrics:
${JSON.stringify(metrics || [], null, 2)}

Recent labs:
${JSON.stringify(recentLabs || [], null, 2)}

Comprehensive genetics:
${JSON.stringify(geneticsResult?.data || {}, null, 2)}

Return valid JSON only:
{
  "executive_summary": "1-2 paragraphs",
  "meal_plan": [
    {
      "meal_name": "Name",
      "meal_type": "breakfast|lunch|dinner|snack",
      "why": "Why this fits the health picture",
      "recipe": "2-4 sentence high-quality preparation guidance with ingredients or assembly notes",
      "foods": [
        {
          "name": "Food name",
          "rating": "green|yellow|red",
          "reason": "Sodium/potassium/phosphorus/protein explanation"
        }
      ]
    }
  ],
  "grocery_list": ["8-15 items"],
  "education": ["3-6 bullets"],
  "methylation_food_notes": ["2-5 bullets"],
  "weekly_focus": ["3-5 short goals"]
}`;

    const raw = await callOpenAI({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      system,
      user: userPrompt,
    });

    return NextResponse.json({ ok: true, suggestions: parseJson(raw) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest meals' },
      { status: 500 }
    );
  }
}

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
