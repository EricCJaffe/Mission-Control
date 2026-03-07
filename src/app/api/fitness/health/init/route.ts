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
    // First look for a current health document.
    const { data: existingCurrent } = await supabase
      .from('health_documents')
      .select('id, version, created_at')
      .eq('user_id', userId)
      .eq('is_current', true)
      .single();

    if (existingCurrent) {
      return NextResponse.json({
        error: 'Health document already exists',
        message: 'Health profile has already been initialized. Use the update endpoint to modify it.'
      }, { status: 400 });
    }

    // Legacy installs may have one health document with is_current=false because of an
    // older schema/index mismatch. Reactivate that row instead of inserting a duplicate.
    const { data: legacyDoc } = await supabase
      .from('health_documents')
      .select('id, version, created_at')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacyDoc) {
      const { error: reactivateError } = await supabase
        .from('health_documents')
        .update({ is_current: true })
        .eq('id', legacyDoc.id)
        .eq('user_id', userId);

      if (reactivateError) {
        console.error('Failed to reactivate legacy health document:', reactivateError);
        return NextResponse.json({
          error: 'Failed to reactivate health document',
          details: reactivateError.message,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Existing health profile reactivated successfully',
        document: {
          id: legacyDoc.id,
          version: legacyDoc.version,
          created_at: legacyDoc.created_at,
        },
      });
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
    .select('id, version, created_at, is_current')
    .eq('user_id', userId)
    .eq('is_current', true)
    .single();

  if (!healthDoc) {
    const { data: legacyDoc } = await supabase
      .from('health_documents')
      .select('id, version, created_at, is_current')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      exists: !!legacyDoc,
      document: legacyDoc || null,
    });
  }

  return NextResponse.json({
    exists: !!healthDoc,
    document: healthDoc || null,
  });
}
