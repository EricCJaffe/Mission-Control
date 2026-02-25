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
  const { data: document, error } = await supabase
    .from('health_documents')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

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

    // Generate embedding for new version
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: content,
      }),
    });

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data?.[0]?.embedding;

    if (!embedding) {
      throw new Error('Failed to generate embedding');
    }

    // Create new version
    const { data: newDoc, error: insertError } = await supabase
      .from('health_documents')
      .insert({
        user_id: userData.user.id,
        version: nextVersion,
        content,
        embedding,
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
