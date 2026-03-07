import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: target } = await supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle();
  const { data: logs } = await supabase.from('nutrition_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(12);

  const system = await buildAISystemPrompt(user.id, 'nutrition_advice');
  const userPrompt = `Create a short adaptive nutrition quiz for this user. Focus on heart-failure-safe hydration/nutrition, sodium awareness, potassium/phosphorus awareness, workout fueling, and Mediterranean/DASH choices.

Targets:\n${JSON.stringify(target || {}, null, 2)}
Recent logs:\n${JSON.stringify(logs || [], null, 2)}

Return valid JSON only:
{
  "topic": "short topic title",
  "questions": [
    {
      "question": "text",
      "options": ["A","B","C","D"],
      "correct_index": 1,
      "explanation": "why"
    }
  ]
}`;

  const raw = await callOpenAI({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', system, user: userPrompt });
  const quiz = parseJson(raw);
  return NextResponse.json({ ok: true, quiz });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const questions = Array.isArray(body.questions) ? body.questions as Array<Record<string, unknown>> : [];
    const answers = Array.isArray(body.answers) ? body.answers as unknown[] : [];
    const score = questions.reduce((sum: number, question: Record<string, unknown>, index: number) => (
      sum + (Number(question.correct_index) === Number(answers[index]) ? 1 : 0)
    ), 0);

    const { data, error } = await supabase
      .from('nutrition_quiz_attempts')
      .insert({
        user_id: user.id,
        topic: typeof body.topic === 'string' ? body.topic : 'Nutrition Quiz',
        questions,
        score,
        total: questions.length,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, attempt: data, score, total: questions.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save quiz attempt' }, { status: 500 });
  }
}

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
