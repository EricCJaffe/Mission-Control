import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { INITIAL_HEALTH_MD } from '@/lib/fitness/initial-health-content';

/**
 * Initialize health.md for the current user
 * POST /api/fitness/health/init
 *
 * Creates the initial health document with comprehensive medical profile
 * and generates vector embedding for AI search
 */
export async function POST() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  try {
    // Check if health document already exists
    const { data: existing } = await supabase
      .from('health_documents')
      .select('id')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'Health document already exists',
        message: 'Health profile has already been initialized. Use the update endpoint to modify it.'
      }, { status: 400 });
    }

    // Skip embedding generation for now - vector extension might not be enabled
    // const embedding: number[] | null = null;

    // Insert health document (without embedding - vector extension not enabled)
    console.log('Attempting to insert health document with:', {
      user_id: userId,
      content_length: INITIAL_HEALTH_MD.length,
      version: 1,
      is_current: true,
    });

    const { data: healthDoc, error: insertError } = await supabase
      .from('health_documents')
      .insert({
        user_id: userId,
        content: INITIAL_HEALTH_MD,
        version: 1,
        is_current: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert health document:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
      return NextResponse.json({ error: 'Failed to create health document', details: insertError.message }, { status: 500 });
    }

    console.log('Health document inserted successfully:', healthDoc.id);

    // Create initial change record
    await supabase
      .from('health_document_changes')
      .insert({
        user_id: userId,
        document_id: healthDoc.id,
        change_type: 'manual_edit',
        change_summary: 'Initial health profile created',
        changed_by: 'user',
      });

    return NextResponse.json({
      success: true,
      message: 'Health profile initialized successfully',
      document: {
        id: healthDoc.id,
        version: healthDoc.version,
        created_at: healthDoc.created_at,
      },
    });

  } catch (error) {
    console.error('Error initializing health document:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : String(error)
    }, { status: 500 });
  }
}

/**
 * Check if health document exists
 * GET /api/fitness/health/init
 */
export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: healthDoc } = await supabase
    .from('health_documents')
    .select('id, version, created_at, updated_at, is_current')
    .eq('user_id', userId)
    .eq('is_current', true)
    .single();

  return NextResponse.json({
    exists: !!healthDoc,
    document: healthDoc || null,
  });
}
