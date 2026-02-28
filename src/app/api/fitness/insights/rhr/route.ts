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
    const { rhrData, stats } = body;

    // Build context for AI
    const dataPoints = rhrData.map((d: any) => `${d.metric_date}: ${d.resting_hr} bpm`).join('\n');

    const prompt = `You are a cardiovascular health and fitness expert. Analyze this resting heart rate (RHR) data and provide personalized recommendations.

## RHR Data (Last 30 Days)
${dataPoints}

## Statistics
- Average: ${stats.avg} bpm
- Min: ${stats.min} bpm
- Max: ${stats.max} bpm
- 7-Day Trend: ${stats.trend > 0 ? '+' : ''}${stats.trend.toFixed(1)} bpm (${stats.trend < -2 ? 'improving' : stats.trend > 2 ? 'increasing' : 'stable'})

## Your Task
Provide:
1. **Analysis**: What does the data show about cardiovascular fitness and recovery?
2. **Trends**: Is RHR improving, stable, or concerning?
3. **Recommendations**: 3-5 specific, actionable steps to lower RHR and improve cardiovascular health
4. **Considerations**: Any patterns or flags to be aware of

Be concise but thorough. Focus on practical advice.`;

    const content = await callOpenAI({
      model: 'gpt-4o',
      system: 'You are an expert in cardiovascular health and fitness coaching. Provide evidence-based, actionable recommendations.',
      user: prompt,
    });

    // Save insight to database
    const { data: insight, error } = await supabase
      .from('ai_insights')
      .insert({
        user_id: user.id,
        insight_type: 'rhr_analysis',
        title: 'Resting Heart Rate Analysis',
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
    console.error('RHR insight generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate insight' },
      { status: 500 }
    );
  }
}
