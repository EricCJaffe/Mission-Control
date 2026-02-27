import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { HealthDocUpdater } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/health/approve-updates
 *
 * Approve or reject pending health.md updates
 *
 * Body: {
 *   update_ids: string[],
 *   action: 'approve' | 'reject'
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { update_ids, action } = body;

    if (!update_ids || !Array.isArray(update_ids) || update_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'update_ids must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { ok: false, error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    console.log(`[Approve Updates] ${action}ing ${update_ids.length} updates for user ${user.id}`);

    if (action === 'approve') {
      // Apply updates using HealthDocUpdater
      const updater = new HealthDocUpdater(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const result = await updater.applyUpdates(user.id, update_ids);

      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: 'Failed to apply updates to health document' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        action: 'approved',
        applied_count: update_ids.length,
        new_version: result.new_version,
      });
    } else {
      // Reject updates - mark as rejected in database
      const { error: rejectError } = await supabase
        .from('health_doc_pending_updates')
        .update({ status: 'rejected' })
        .in('id', update_ids)
        .eq('user_id', user.id); // Security: only update user's own updates

      if (rejectError) {
        console.error('Error rejecting updates:', rejectError);
        return NextResponse.json(
          { ok: false, error: 'Failed to reject updates' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        action: 'rejected',
        rejected_count: update_ids.length,
      });
    }
  } catch (error) {
    console.error('Error in approve-updates:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to process updates',
      },
      { status: 500 }
    );
  }
}
