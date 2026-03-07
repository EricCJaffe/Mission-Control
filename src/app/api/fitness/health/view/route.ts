import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET - Fetch health document (current or specific version)
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const versionId = searchParams.get('version_id');

  if (versionId) {
    // Fetch specific version
    const { data: document, error } = await supabase
      .from('health_documents')
      .select('*')
      .eq('id', versionId)
      .eq('user_id', userData.user.id)
      .single();

    if (error || !document) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({ document });
  }

  // Fetch current version
  let { data: document, error } = await supabase
    .from('health_documents')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

  if (!document) {
    const fallback = await supabase
      .from('health_documents')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    document = fallback.data;
    error = fallback.error;
  }

  if (error || !document) {
    return NextResponse.json({ error: 'Health document not found' }, { status: 404 });
  }

  return NextResponse.json({ document });
}

/**
 * PUT - Update health document (creates new version)
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { content, change_note } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  try {
    // Get current version
    const { data: currentDoc } = await supabase
      .from('health_documents')
      .select('version')
      .eq('user_id', userData.user.id)
      .eq('is_current', true)
      .single();

    const nextVersion = (currentDoc?.version || 0) + 1;

    // Mark current document as not current
    if (currentDoc) {
      await supabase
        .from('health_documents')
        .update({ is_current: false })
        .eq('user_id', userData.user.id)
        .eq('is_current', true);
    }

    // Create new version (skip embedding - vector extension not enabled)
    const { data: newDoc, error: insertError } = await supabase
      .from('health_documents')
      .insert({
        user_id: userData.user.id,
        version: nextVersion,
        content,
        is_current: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create new health document version:', insertError);
      return NextResponse.json({
        error: 'Failed to save changes',
        details: insertError.message,
      }, { status: 500 });
    }

    // Log change in audit trail
    await supabase
      .from('health_document_changes')
      .insert({
        user_id: userData.user.id,
        document_id: newDoc.id,
        change_type: 'manual_edit',
        change_summary: change_note || 'Manual edit',
        changed_by: 'user',
      });

    return NextResponse.json({
      success: true,
      document: newDoc,
    });

  } catch (error) {
    console.error('Error updating health document:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
