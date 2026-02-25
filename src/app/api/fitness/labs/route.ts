import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { extractLabResults } from '@/lib/fitness/ai';

/**
 * GET /api/fitness/labs — List lab panels with their results
 * POST /api/fitness/labs — Create panel + extract/analyze results
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const panelId = url.searchParams.get('panel_id');

  // Single panel with results
  if (panelId) {
    const [{ data: panel }, { data: results }] = await Promise.all([
      supabase.from('lab_panels').select('*').eq('id', panelId).eq('user_id', user.id).single(),
      supabase.from('lab_results').select('*').eq('panel_id', panelId).eq('user_id', user.id).order('test_name'),
    ]);
    if (!panel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ panel: { ...panel, results: results ?? [] } });
  }

  // List panels
  const { data: panels, error } = await supabase
    .from('lab_panels')
    .select('id, panel_date, lab_name, ordering_provider, source_type, ai_extracted, ai_summary, fasting, notes, created_at')
    .eq('user_id', user.id)
    .order('panel_date', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get result counts per panel
  const panelIds = panels?.map(p => p.id) ?? [];
  let resultCounts: Record<string, number> = {};
  let flagCounts: Record<string, number> = {};

  if (panelIds.length > 0) {
    const { data: results } = await supabase
      .from('lab_results')
      .select('panel_id, flag')
      .eq('user_id', user.id)
      .in('panel_id', panelIds);

    if (results) {
      for (const r of results) {
        resultCounts[r.panel_id] = (resultCounts[r.panel_id] ?? 0) + 1;
        if (r.flag && r.flag !== 'normal') {
          flagCounts[r.panel_id] = (flagCounts[r.panel_id] ?? 0) + 1;
        }
      }
    }
  }

  const enriched = panels?.map(p => ({
    ...p,
    result_count: resultCounts[p.id] ?? 0,
    flag_count: flagCounts[p.id] ?? 0,
  }));

  return NextResponse.json({ panels: enriched ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { panel_date, lab_name, ordering_provider, raw_text, fasting, notes } = body;

  if (!panel_date || !raw_text) {
    return NextResponse.json({ error: 'panel_date and raw_text are required' }, { status: 400 });
  }

  // Create panel
  const { data: panel, error: panelError } = await supabase
    .from('lab_panels')
    .insert({
      user_id: user.id,
      panel_date,
      lab_name: lab_name || null,
      ordering_provider: ordering_provider || null,
      source_type: 'manual_entry',
      fasting: fasting ?? null,
      notes: notes || null,
    })
    .select()
    .single();

  if (panelError) return NextResponse.json({ error: panelError.message }, { status: 500 });

  // Get previous results for trend notes
  const { data: prevResults } = await supabase
    .from('lab_results')
    .select('test_name, value, panel_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // Group previous by test_name (latest only)
  const prevByTest = new Map<string, { test_name: string; value: number; panel_date: string }>();
  if (prevResults) {
    for (const r of prevResults) {
      if (!prevByTest.has(r.test_name) && r.value != null) {
        prevByTest.set(r.test_name, { test_name: r.test_name, value: Number(r.value), panel_date: panel_date });
      }
    }
  }

  // AI extraction
  let extractedResults: Awaited<ReturnType<typeof extractLabResults>> = [];
  let aiSummary: string | null = null;
  try {
    extractedResults = await extractLabResults({
      raw_text,
      panel_date,
      previous_results: Array.from(prevByTest.values()),
    });

    // Build AI summary
    const abnormal = extractedResults.filter(r => r.flag !== 'normal');
    if (extractedResults.length > 0) {
      aiSummary = `Extracted ${extractedResults.length} test results. ${
        abnormal.length > 0
          ? `${abnormal.length} flagged: ${abnormal.map(r => `${r.test_name} (${r.flag})`).join(', ')}.`
          : 'All results within normal range.'
      }`;
    }
  } catch (err) {
    console.error('Lab extraction failed', err);
  }

  // Save extracted results
  if (extractedResults.length > 0) {
    const rows = extractedResults.map(r => ({
      user_id: user.id,
      panel_id: panel.id,
      test_name: r.test_name,
      test_category: r.test_category || null,
      value: r.value,
      value_text: r.value_text || null,
      unit: r.unit || null,
      reference_low: r.reference_low,
      reference_high: r.reference_high,
      reference_range_text: r.reference_range_text || null,
      flag: r.flag || 'normal',
      flag_auto: true,
      ai_interpretation: r.ai_interpretation || null,
      ai_trend_note: r.ai_trend_note || null,
    }));

    await supabase.from('lab_results').insert(rows);
  }

  // Update panel with AI info
  await supabase
    .from('lab_panels')
    .update({
      ai_extracted: extractedResults.length > 0,
      ai_extraction_confidence: extractedResults.length > 0 ? 0.85 : null,
      ai_summary: aiSummary,
    })
    .eq('id', panel.id);

  // Fetch complete panel with results
  const { data: results } = await supabase
    .from('lab_results')
    .select('*')
    .eq('panel_id', panel.id)
    .order('test_name');

  return NextResponse.json({
    ok: true,
    panel: { ...panel, ai_extracted: true, ai_summary: aiSummary, results: results ?? [] },
  });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const panelId = searchParams.get('panel_id');
  const resultId = searchParams.get('result_id');

  if (panelId) {
    // Delete panel (cascade deletes results)
    const { error } = await supabase.from('lab_panels').delete().eq('id', panelId).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (resultId) {
    const { error } = await supabase.from('lab_results').delete().eq('id', resultId).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'panel_id or result_id required' }, { status: 400 });
}
