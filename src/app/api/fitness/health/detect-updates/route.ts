import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { HealthDocUpdater, type UpdateTrigger } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/health/detect-updates
 *
 * Detects if health.md needs updating based on trigger event
 * Saves pending updates to database for user review
 *
 * Body: {
 *   trigger: UpdateTrigger,
 *   trigger_data?: any
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
    const { trigger, trigger_data } = body as { trigger: UpdateTrigger; trigger_data?: any };

    if (!trigger) {
      return NextResponse.json(
        { ok: false, error: 'trigger is required' },
        { status: 400 }
      );
    }

    // Check if health document exists
    const { data: healthDoc } = await supabase
      .from('health_documents')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .single();

    if (!healthDoc) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Health document not initialized. Visit /fitness/health/init first.',
        },
        { status: 404 }
      );
    }

    // Initialize updater service
    const updater = new HealthDocUpdater(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Detect updates
    console.log(`[Health Doc] Detecting updates for user ${user.id}, trigger: ${trigger}`);
    const updates = await updater.detectUpdates(user.id, trigger, trigger_data);

    if (updates.length === 0) {
      console.log(`[Health Doc] No updates detected for trigger: ${trigger}`);
      return NextResponse.json({
        ok: true,
        updates_detected: false,
        pending_updates: [],
        message: 'No updates needed',
      });
    }

    // Check for recent duplicates (within last hour) to avoid spam
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentUpdates } = await supabase
      .from('health_doc_pending_updates')
      .select('section_number')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', oneHourAgo);

    const recentSections = new Set((recentUpdates || []).map(u => u.section_number));
    const newUpdates = updates.filter(u => !recentSections.has(u.section_number));

    if (newUpdates.length === 0) {
      console.log(`[Health Doc] All detected updates already pending, skipping duplicates`);
      return NextResponse.json({
        ok: true,
        updates_detected: false,
        pending_updates: [],
        message: 'Updates already pending review',
      });
    }

    // Save pending updates
    const updateIds = await updater.savePendingUpdates(user.id, newUpdates);

    console.log(`[Health Doc] Saved ${updateIds.length} pending updates for user ${user.id}`);

    // Generate notification message
    const sectionNames = newUpdates.map(u => u.section_name).join(', ');
    const notificationMessage = `${newUpdates.length} section${newUpdates.length > 1 ? 's' : ''} need${newUpdates.length === 1 ? 's' : ''} review: ${sectionNames}`;

    return NextResponse.json({
      ok: true,
      updates_detected: true,
      pending_updates: newUpdates.map(u => ({
        section_number: u.section_number,
        section_name: u.section_name,
        reason: u.reason,
        confidence: u.confidence,
      })),
      update_ids: updateIds,
      notification_message: notificationMessage,
    });
  } catch (error) {
    console.error('Error detecting health document updates:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to detect updates',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fitness/health/detect-updates
 *
 * Get count of pending updates for current user
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

    const { count, error } = await supabase
      .from('health_doc_pending_updates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Error counting pending updates:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pending_count: count || 0,
    });
  } catch (error) {
    console.error('Error getting pending updates count:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to get count',
      },
      { status: 500 }
    );
  }
}
