import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/fitness/health/pending-updates
 *
 * Get all pending health.md updates for current user
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: updates, error } = await supabase
      .from('health_doc_pending_updates')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending updates:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pending_updates: updates || [],
      count: updates?.length || 0,
    });
  } catch (error) {
    console.error('Error in pending-updates GET:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch updates',
      },
      { status: 500 }
    );
  }
}
