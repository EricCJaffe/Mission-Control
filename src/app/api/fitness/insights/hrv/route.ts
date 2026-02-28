import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { callOpenAI } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hrvData, stats } = body;

    // Build context for AI
    const dataPoints = hrvData.map((d: any) => `${d.metric_date}: ${d.hrv_ms} ms`).join('\n');

    const prompt = `You are an expert in heart rate variability (HRV) analysis, stress physiology, and recovery optimization. Analyze this HRV data and provide personalized recommendations.

## HRV Data (Last 30 Days)
${dataPoints}

## Statistics
- Average: ${stats.avg} ms
- Min: ${stats.min} ms
- Max: ${stats.max} ms
- 7-Day Trend: ${stats.trend > 0 ? '+' : ''}${stats.trend.toFixed(1)} ms (${stats.trend > 2 ? 'improving' : stats.trend < -2 ? 'declining' : 'stable'})

## Your Task
Provide:
1. **Analysis**: What does the HRV data indicate about recovery, stress, and nervous system balance?
2. **Trends**: Is HRV improving, stable, or concerning?
3. **Recommendations**: 3-5 specific, actionable steps to increase HRV and improve recovery (sleep, stress management, breathwork, training adjustments)
4. **Red Flags**: Any patterns suggesting overtraining, illness, or chronic stress?

Be concise but thorough. Focus on practical, evidence-based advice. Remember: higher HRV is better.`;

    const content = await callOpenAI({
      model: 'gpt-4o',
      system: 'You are an expert in HRV analysis, autonomic nervous system function, and recovery optimization. Provide evidence-based, actionable recommendations.',
      user: prompt,
    });

    // Save insight to database
    const { data: insight, error } = await supabase
      .from('ai_insights')
      .insert({
        user_id: user.id,
        insight_type: 'hrv_analysis',
        title: 'Heart Rate Variability Analysis',
        content: content,
        priority: 'info',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving insight:', error);
      return NextResponse.json({ error: 'Failed to save insight' }, { status: 500 });
    }

    return NextResponse.json({ insight });
  } catch (error: any) {
    console.error('HRV insight generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate insight' },
      { status: 500 }
    );
  }
}
