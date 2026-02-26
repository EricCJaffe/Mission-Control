import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET - Fetch dashboard data for lab trends analysis
 * Query params:
 *   - filter: 'last3' | 'year:YYYY' | 'all' (default: 'all')
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'all';

  try {
    // Build panel query with filter
    let panelQuery = supabase
      .from('lab_panels')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('status', 'confirmed')
      .order('panel_date', { ascending: false });

    if (filter === 'last3') {
      panelQuery = panelQuery.limit(3);
    } else if (filter.startsWith('year:')) {
      const year = filter.split(':')[1];
      panelQuery = panelQuery
        .gte('panel_date', `${year}-01-01`)
        .lte('panel_date', `${year}-12-31`);
    }

    const { data: panels, error: panelsError } = await panelQuery;

    if (panelsError) {
      console.error('Error fetching panels:', panelsError);
      return NextResponse.json({ error: 'Failed to fetch panels' }, { status: 500 });
    }

    if (!panels || panels.length === 0) {
      return NextResponse.json({
        panels: [],
        test_trends: {},
        flagged_results: [],
        key_metrics: {},
      });
    }

    // Fetch all results for these panels
    const panelIds = panels.map(p => p.id);
    const { data: allResults } = await supabase
      .from('lab_results')
      .select('*')
      .in('panel_id', panelIds)
      .order('test_name');

    // Build test trends map: { test_name: [{ date, value, unit, flag, panel_id }] }
    const testTrendsMap = new Map<string, Array<{
      date: string;
      value: string;
      unit: string;
      flag: string;
      panel_id: string;
      panel_date: string;
    }>>();

    // Track flagged results across all panels
    const flaggedResults: Array<{
      test_name: string;
      value: string;
      unit: string;
      reference_range: string;
      flag: string;
      panel_date: string;
      panel_id: string;
    }> = [];

    if (allResults) {
      for (const result of allResults) {
        const panel = panels.find(p => p.id === result.panel_id);
        if (!panel) continue;

        const testName = result.normalized_test_name || result.test_name;

        // Add to trends map
        if (!testTrendsMap.has(testName)) {
          testTrendsMap.set(testName, []);
        }
        testTrendsMap.get(testName)!.push({
          date: panel.panel_date,
          value: result.value,
          unit: result.unit,
          flag: result.flag,
          panel_id: result.panel_id,
          panel_date: panel.panel_date,
        });

        // Track flagged results
        if (result.flag !== 'normal') {
          flaggedResults.push({
            test_name: result.test_name,
            value: result.value,
            unit: result.unit,
            reference_range: result.reference_range || '',
            flag: result.flag,
            panel_date: panel.panel_date,
            panel_id: result.panel_id,
          });
        }
      }
    }

    // Convert trends map to object for JSON serialization
    const testTrends: Record<string, Array<any>> = {};
    testTrendsMap.forEach((values, key) => {
      // Sort by date ascending for charting
      testTrends[key] = values.sort((a, b) =>
        new Date(a.panel_date).getTime() - new Date(b.panel_date).getTime()
      );
    });

    // Extract key metrics
    const keyMetricNames = [
      'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 'CRP', 'Lipoprotein(a)', 'BNP',
      'eGFR', 'Creatinine', 'BUN',
      'A1C', 'Glucose', 'Insulin'
    ];

    const keyMetrics: Record<string, Array<any>> = {};
    keyMetricNames.forEach(name => {
      const nameLower = name.toLowerCase();
      // Try to find by normalized name or exact match
      const matchingKey = Array.from(testTrendsMap.keys()).find(k =>
        k.toLowerCase().includes(nameLower) || nameLower.includes(k.toLowerCase())
      );
      if (matchingKey) {
        keyMetrics[matchingKey] = testTrends[matchingKey];
      }
    });

    return NextResponse.json({
      panels,
      test_trends: testTrends,
      flagged_results: flaggedResults,
      key_metrics: keyMetrics,
      filter_applied: filter,
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
