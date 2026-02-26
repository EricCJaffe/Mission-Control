import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';

/**
 * POST - Generate comprehensive AI analysis across all lab panels
 * Groups by category (Cardiac, Kidney, Metabolic) and analyzes trends
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { filter = 'all' } = body;

    // Build panel query with filter
    let panelQuery = supabase
      .from('lab_panels')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('status', 'confirmed')
      .order('panel_date', { ascending: true }); // Oldest first for trend analysis

    if (filter === 'last3') {
      panelQuery = panelQuery.limit(3);
    } else if (filter.startsWith('year:')) {
      const year = filter.split(':')[1];
      panelQuery = panelQuery
        .gte('panel_date', `${year}-01-01`)
        .lte('panel_date', `${year}-12-31`);
    }

    const { data: panels, error: panelsError } = await panelQuery;

    if (panelsError || !panels || panels.length === 0) {
      return NextResponse.json({
        error: 'No confirmed lab panels found'
      }, { status: 404 });
    }

    // Fetch all results for these panels
    const panelIds = panels.map(p => p.id);
    const { data: allResults } = await supabase
      .from('lab_results')
      .select('*')
      .in('panel_id', panelIds)
      .order('panel_id, test_category, test_name');

    if (!allResults || allResults.length === 0) {
      return NextResponse.json({
        error: 'No test results found'
      }, { status: 404 });
    }

    // Group results by category
    const categoryMap = new Map<string, Map<string, Array<{
      date: string;
      value: string;
      unit: string;
      flag: string;
      reference_range: string;
    }>>>();

    // Category mappings
    const categoryMapping: Record<string, string> = {
      'lipids': 'Cardiac Health',
      'cardiac': 'Cardiac Health',
      'kidney': 'Kidney Function',
      'metabolic': 'Metabolic Health',
      'glucose': 'Metabolic Health',
      'liver': 'Liver Function',
      'thyroid': 'Thyroid Function',
      'vitamins': 'Vitamins & Nutrients',
      'inflammation': 'Inflammation',
      'cbc': 'Blood Health',
    };

    for (const result of allResults) {
      const panel = panels.find(p => p.id === result.panel_id);
      if (!panel) continue;

      const rawCategory = result.test_category || 'other';
      const category = categoryMapping[rawCategory.toLowerCase()] || 'Other';
      const testName = result.normalized_test_name || result.test_name;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }

      const categoryTests = categoryMap.get(category)!;
      if (!categoryTests.has(testName)) {
        categoryTests.set(testName, []);
      }

      categoryTests.get(testName)!.push({
        date: panel.panel_date,
        value: result.value,
        unit: result.unit,
        flag: result.flag,
        reference_range: result.reference_range || '',
      });
    }

    // Build AI prompt
    const systemPrompt = await buildAISystemPrompt(userData.user.id, 'comprehensive_lab_analysis');

    // Format data for AI
    let dataForAI = `# Comprehensive Lab Analysis\n\n`;
    dataForAI += `**Analysis Period**: ${panels[0].panel_date} to ${panels[panels.length - 1].panel_date}\n`;
    dataForAI += `**Total Panels**: ${panels.length}\n\n`;

    categoryMap.forEach((tests, category) => {
      dataForAI += `\n## ${category}\n\n`;
      tests.forEach((measurements, testName) => {
        dataForAI += `### ${testName}\n`;
        measurements.forEach(m => {
          dataForAI += `- ${m.date}: ${m.value} ${m.unit} (ref: ${m.reference_range}) [${m.flag}]\n`;
        });
        dataForAI += '\n';
      });
    });

    const userPrompt = `${dataForAI}

Analyze these lab results comprehensively. Focus on CARDIAC HEALTH, KIDNEY FUNCTION, and METABOLIC HEALTH as priority categories.

For each major category, provide:
1. **Overall Trend**: Are things improving, stable, or worsening since the first panel?
2. **Key Findings**: What stands out? Any concerning patterns?
3. **Clinical Significance**: What do these trends mean for long-term health?
4. **Actionable Recommendations**: Specific, practical steps to improve or maintain these markers
   - Dietary changes (be specific: foods to add/avoid)
   - Exercise recommendations (type, intensity, frequency)
   - Lifestyle modifications (sleep, stress, hydration, etc.)
   - Supplements or medications to discuss with doctor
   - Follow-up testing recommendations

Return JSON:
\`\`\`json
{
  "executive_summary": "2-3 paragraph overview of overall health trajectory, major improvements, areas of concern, and priority actions",
  "categories": [
    {
      "name": "Cardiac Health",
      "overall_trend": "improving" | "stable" | "worsening" | "mixed",
      "trend_description": "Detailed explanation of trends with specific numbers and dates",
      "key_findings": [
        "Finding 1 with context",
        "Finding 2 with context"
      ],
      "clinical_significance": "What these trends mean for cardiovascular health and longevity",
      "recommendations": {
        "dietary": ["Specific food/diet recommendation 1", "Recommendation 2"],
        "exercise": ["Specific exercise recommendation 1", "Recommendation 2"],
        "lifestyle": ["Specific lifestyle change 1", "Change 2"],
        "medical": ["Follow-up test to request", "Supplement or medication to discuss with doctor"],
        "monitoring": ["What to watch", "When to retest"]
      },
      "priority": "high" | "medium" | "low"
    }
  ],
  "priority_actions": [
    "Top 3-5 most important actions to take immediately"
  ]
}
\`\`\`

Be specific, actionable, and evidence-based. Focus on practical steps the patient can implement. Return ONLY the JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', errorText);
      return NextResponse.json({
        error: 'Failed to generate analysis'
      }, { status: 500 });
    }

    const aiResponse = await response.json();
    const analysisText = aiResponse.choices[0]?.message?.content;

    if (!analysisText) {
      return NextResponse.json({
        error: 'No content from AI'
      }, { status: 500 });
    }

    // Parse JSON
    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
    const analysis = JSON.parse(jsonText);

    // Add metadata
    analysis.generated_at = new Date().toISOString();
    analysis.panels_analyzed = panels.length;
    analysis.date_range = {
      from: panels[0].panel_date,
      to: panels[panels.length - 1].panel_date,
    };

    return NextResponse.json({
      success: true,
      analysis,
    });

  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
