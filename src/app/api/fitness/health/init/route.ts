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

    // Generate vector embedding using OpenAI
    let embedding: number[] | null = null;

    if (process.env.OPENAI_API_KEY) {
      try {
        const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: embeddingModel,
            input: INITIAL_HEALTH_MD,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          embedding = data.data[0].embedding;
        } else {
          console.warn('Failed to generate embedding:', await response.text());
        }
      } catch (embeddingError) {
        console.warn('Embedding generation failed:', embeddingError);
        // Continue without embedding - it's not critical for functionality
      }
    }

    // Insert health document
    const { data: healthDoc, error: insertError } = await supabase
      .from('health_documents')
      .insert({
        user_id: userId,
        content: INITIAL_HEALTH_MD,
        version: 1,
        is_current: true,
        embedding: embedding,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert health document:', insertError);
      return NextResponse.json({ error: 'Failed to create health document', details: insertError.message }, { status: 500 });
    }

    // Create initial change record
    await supabase
      .from('health_document_changes')
      .insert({
        user_id: userId,
        document_id: healthDoc.id,
        previous_version: null,
        new_version: 1,
        change_summary: 'Initial health profile created',
        trigger_type: 'manual',
        trigger_details: { action: 'initialization', source: 'api' },
      });

    return NextResponse.json({
      success: true,
      message: 'Health profile initialized successfully',
      document: {
        id: healthDoc.id,
        version: healthDoc.version,
        created_at: healthDoc.created_at,
        has_embedding: embedding !== null,
      },
    });

  } catch (error) {
    console.error('Error initializing health document:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
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
