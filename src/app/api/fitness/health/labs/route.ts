import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateLabAnalysis } from '@/lib/fitness/lab-processor';

/**
 * GET - Fetch lab panel details with results
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const panelId = searchParams.get('panel_id');

  if (!panelId) {
    return NextResponse.json({ error: 'panel_id required' }, { status: 400 });
  }

  // Fetch panel
  const { data: panel, error: panelError } = await supabase
    .from('lab_panels')
    .select('*')
    .eq('id', panelId)
    .eq('user_id', userData.user.id)
    .single();

  if (panelError || !panel) {
    return NextResponse.json({ error: 'Panel not found' }, { status: 404 });
  }

  // Fetch results
  const { data: results } = await supabase
    .from('lab_results')
    .select('*')
    .eq('panel_id', panelId)
    .order('test_category, test_name');

  return NextResponse.json({
    panel,
    results: results || [],
  });
}

/**
 * PUT - Update panel metadata and confirm
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { panel_id, lab_name, panel_date, provider_name, fasting, confirm } = body;

  if (!panel_id) {
    return NextResponse.json({ error: 'panel_id required' }, { status: 400 });
  }

  // Update panel metadata
  const updates: any = {};
  if (lab_name !== undefined) updates.lab_name = lab_name;
  if (panel_date !== undefined) updates.panel_date = panel_date;
  if (provider_name !== undefined) updates.provider_name = provider_name;
  if (fasting !== undefined) updates.fasting = fasting;

  if (confirm) {
    // Generate AI analysis before confirming
    try {
      const analysis = await generateLabAnalysis({
        userId: userData.user.id,
        panelId: panel_id,
      });

      updates.ai_summary = analysis.summary;
      updates.status = 'confirmed';

      // TODO: Store trends and health_doc_updates for review
      // For now, just log them
      console.log('Lab analysis generated:', {
        trends: analysis.trends,
        health_doc_updates: analysis.health_doc_updates,
      });

    } catch (error) {
      console.error('Failed to generate lab analysis:', error);
      return NextResponse.json({
        error: 'Failed to generate analysis. Please try again.',
      }, { status: 500 });
    }
  }

  const { data: panel, error: updateError } = await supabase
    .from('lab_panels')
    .update(updates)
    .eq('id', panel_id)
    .eq('user_id', userData.user.id)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to update panel:', updateError);
    return NextResponse.json({
      error: 'Failed to update panel',
      details: updateError.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    panel,
  });
}

/**
 * DELETE - Delete lab panel and all results
 */
export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const panelId = searchParams.get('panel_id');

  if (!panelId) {
    return NextResponse.json({ error: 'panel_id required' }, { status: 400 });
  }

  // Delete results first (cascade should handle this, but being explicit)
  await supabase
    .from('lab_results')
    .delete()
    .eq('panel_id', panelId);

  // Delete panel
  const { error: deleteError } = await supabase
    .from('lab_panels')
    .delete()
    .eq('id', panelId)
    .eq('user_id', userData.user.id);

  if (deleteError) {
    console.error('Failed to delete panel:', deleteError);
    return NextResponse.json({
      error: 'Failed to delete panel',
      details: deleteError.message,
    }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
