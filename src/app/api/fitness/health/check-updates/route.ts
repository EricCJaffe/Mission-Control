import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { HealthDocUpdater, type UpdateTrigger } from '@/lib/fitness/health-doc-updater';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manually re-check health.md against current data.
 *
 * Detection previously only ran as a side effect of uploading a file or a
 * metric shifting, so there was no way to ask "does the document still match
 * my data?" — which matters after importing older records, or after the
 * context that feeds the AI changes. Proposals still land in the normal review
 * queue; nothing is written to the document without approval.
 */
const TRIGGERS: UpdateTrigger[] = [
  'lab_upload',
  'metric_shift',
  'medication_change',
  'imaging_upload',
];

export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { data: healthDoc } = await supabase
    .from('health_documents')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_current', true)
    .maybeSingle();
  if (!healthDoc) {
    return NextResponse.json(
      { ok: false, error: 'health.md is not initialised yet. Visit /fitness/health/init first.' },
      { status: 404 }
    );
  }

  const updater = new HealthDocUpdater(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Sections already awaiting a decision are left alone — re-proposing them
  // would stack near-identical entries in the review queue.
  const { data: alreadyPending } = await supabase
    .from('health_doc_pending_updates')
    .select('section_number')
    .eq('user_id', user.id)
    .eq('status', 'pending');
  const pendingSections = new Set((alreadyPending ?? []).map((r) => r.section_number));

  const bySection = new Map<number, Awaited<ReturnType<typeof updater.detectUpdates>>[number]>();
  const errors: string[] = [];

  for (const trigger of TRIGGERS) {
    try {
      const found = await updater.detectUpdates(user.id, trigger, { manual_check: true });
      for (const update of found) {
        if (pendingSections.has(update.section_number)) continue;
        // Several triggers can propose the same section; keep the first.
        if (!bySection.has(update.section_number)) bySection.set(update.section_number, update);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.error(`[health/check-updates] ${trigger}: ${message}`);
      errors.push(`${trigger}: ${message}`);
    }
  }

  const updates = [...bySection.values()];
  const ids = updates.length ? await updater.savePendingUpdates(user.id, updates) : [];

  return NextResponse.json({
    ok: true,
    proposed: ids.length,
    sections: updates.map((u) => ({ number: u.section_number, name: u.section_name })),
    skipped_already_pending: pendingSections.size,
    errors,
  });
}
