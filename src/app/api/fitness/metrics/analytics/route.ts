/**
 * API Route: Metrics AI Analytics
 *
 * GET /api/fitness/metrics/analytics
 * Analyzes metrics data for correlations, trends, and early warnings
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { callOpenAI } from '@/lib/openai';

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch last 90 days of metrics for analysis
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const { data: metrics, error } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('metric_date', cutoffDate.toISOString().split('T')[0])
      .order('metric_date', { ascending: true });

    if (error) {
      console.error('Error fetching metrics:', error);
      return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }

    if (!metrics || metrics.length < 7) {
      return NextResponse.json({
        error: 'Insufficient data',
        message: 'Need at least 7 days of metrics for analysis',
      });
    }

    // Prepare data summary for AI
    const summary = {
      totalDays: metrics.length,
      dateRange: {
        start: metrics[0].metric_date,
        end: metrics[metrics.length - 1].metric_date,
      },
      metrics: metrics.map((m) => ({
        date: m.metric_date,
        rhr: m.resting_hr,
        hrv: m.hrv_ms,
        bodyBattery: m.body_battery,
        stress: m.stress_avg,
        sleepScore: m.sleep_score,
        sleepDuration: m.sleep_duration_min,
        weight: m.weight_lbs,
      })),
    };

    // Call OpenAI for analysis
    const prompt = `You are a health analytics expert. Analyze this body metrics data and provide insights:

## Data Summary
- Date Range: ${summary.dateRange.start} to ${summary.dateRange.end}
- Total Days: ${summary.totalDays}

## Metrics Data
${JSON.stringify(summary.metrics, null, 2)}

## Analysis Required

1. **Sleep/HRV Correlation**
   - Analyze the relationship between sleep quality/duration and HRV
   - Identify patterns where poor sleep affects HRV
   - Provide specific recommendations

2. **Recovery Trends**
   - Analyze body battery, stress levels, and RHR trends
   - Identify periods of good recovery vs poor recovery
   - Detect any concerning patterns

3. **Early Warning Signs**
   - Identify any declining trends in key metrics (RHR rising, HRV falling, poor sleep)
   - Flag potential health concerns that need attention
   - Provide actionable warnings

## Response Format
Provide a JSON response with this structure:
{
  "sleepHRVCorrelation": {
    "correlation": "strong|moderate|weak|none",
    "insights": ["insight 1", "insight 2"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "recoveryTrends": {
    "overallTrend": "improving|declining|stable",
    "insights": ["insight 1", "insight 2"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "earlyWarnings": {
    "warnings": [
      {
        "severity": "high|medium|low",
        "metric": "metric name",
        "message": "warning message",
        "recommendation": "what to do"
      }
    ]
  },
  "summary": "Overall health summary paragraph"
}

Be specific with dates and numbers. Focus on actionable insights.`;

    const aiResponse = await callOpenAI(prompt);

    // Parse JSON response
    let analysis;
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('AI Response:', aiResponse);
      return NextResponse.json({
        error: 'Failed to parse AI analysis',
        rawResponse: aiResponse,
      });
    }

    return NextResponse.json({
      success: true,
      analysis,
      dataPoints: metrics.length,
    });
  } catch (error) {
    console.error('Metrics analytics error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
