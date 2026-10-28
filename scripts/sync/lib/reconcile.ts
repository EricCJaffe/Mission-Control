/*
 * The task reconcile every harvester shares: projects.ts (repo task lists,
 * issues, code TODOs) and initiatives.ts (coding initiatives' phases).
 * Moved here unchanged from projects.ts so both hold the same edited_at
 * contract; `label` only changes the log prefix.
 */

import type { SyncClient } from './db.ts';
import { dedupeByRef, isUniqueViolation } from './dedupe.ts';

export type Incoming = {
  title: string;
  body: string;
  status: 'todo' | 'done';
  priority: number;
  assignees: string[];
  sourceRef: string;
  sourceUrl: string | null;
  why: string;
};

/*
 * Reconcile one project's harvest against what is already stored.
 *
 * The rule that makes a two-hourly sync safe to leave running: once a task has
 * an `edited_at`, Mission Control owns its status, priority, due date and
 * domain, and the source may only refresh the title and body. Overwriting a
 * decision made in the UI would teach you to stop making decisions in the UI.
 */
export async function reconcile(
  db: SyncClient,
  userId: string,
  projectId: string,
  projectDomain: string | null,
  harvested: Incoming[],
  source: string,
  label = 'projects',
) {
  const now = new Date().toISOString();

  const { data: existing, error } = await db
    .from('tasks')
    .select('id, source_ref, status, edited_at, title, description')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('source', source);
  if (error) throw new Error(`Could not read existing tasks: ${error.message}`);

  const byRef = new Map((existing ?? []).map((t) => [t.source_ref, t]));
  const seenRefs = new Set<string>();
  let created = 0;
  let updated = 0;
  let failed = 0;

  // One bad source must not abort the run: drop in-batch duplicates (logged),
  // and a write that fails is logged and skipped rather than thrown.
  const { unique, dropped } = dedupeByRef(harvested);
  for (const d of dropped) {
    console.warn(`[sync:${label}] duplicate source_ref ${d.sourceRef} in ${source} batch, skipped: "${d.title}"`);
  }

  for (const h of unique) {
    seenRefs.add(h.sourceRef);
    const prior = byRef.get(h.sourceRef);

    if (!prior) {
      const row = {
        user_id: userId,
        project_id: projectId,
        title: h.title.slice(0, 500),
        description: h.body || null,
        status: h.status,
        priority: h.priority,
        domain: projectDomain,
        category: null,
        why: h.why,
        source,
        source_ref: h.sourceRef,
        source_url: h.sourceUrl,
        external_status: 'open',
        assignee: h.assignees.join(', ') || null,
        last_seen_at: now,
        synced_at: now,
      };
      // Upsert on the natural key (user_id, source, source_ref).
      // tasks_source_ref_idx is a PARTIAL unique index (where source <> 'manual'),
      // which PostgREST's on_conflict cannot target, so this is
      // insert-then-update: on a unique violation the existing row is updated
      // in place under the same edited_at contract as below.
      const { error: insertError } = await db.from('tasks').insert(row);
      if (!insertError) {
        created += 1;
        continue;
      }
      if (!isUniqueViolation(insertError)) {
        console.error(`[sync:${label}] insert failed for "${h.title}" (${h.sourceRef}): ${insertError.message}; skipped`);
        failed += 1;
        continue;
      }
      const { data: clash } = await db
        .from('tasks')
        .select('id, project_id, edited_at')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_ref', h.sourceRef)
        .maybeSingle();
      if (!clash || clash.project_id !== projectId) {
        // Same ref owned by another project: never move it, just report it.
        console.warn(`[sync:${label}] ${h.sourceRef} already stored under project ${clash?.project_id ?? '?'}; skipped "${h.title}"`);
        failed += 1;
        continue;
      }
      const conflictPatch: Record<string, unknown> = { last_seen_at: now, synced_at: now, external_status: 'open', source_url: h.sourceUrl };
      if (!clash.edited_at) Object.assign(conflictPatch, { title: row.title, description: row.description, status: row.status, priority: row.priority });
      const { error: upErr } = await db.from('tasks').update(conflictPatch).eq('id', clash.id);
      if (upErr) {
        console.error(`[sync:${label}] upsert-update failed for "${h.title}": ${upErr.message}; skipped`);
        failed += 1;
      } else updated += 1;
      continue;
    }

    const patch: Record<string, unknown> = {
      last_seen_at: now,
      synced_at: now,
      external_status: 'open',
      source_url: h.sourceUrl,
    };
    // Untouched here? Then the source is still authoritative for everything.
    if (!prior.edited_at) {
      patch.title = h.title.slice(0, 500);
      patch.description = h.body || null;
      patch.status = h.status;
      patch.priority = h.priority;
    }
    const { error: updateError } = await db.from('tasks').update(patch).eq('id', prior.id);
    if (updateError) {
      console.error(`[sync:${label}] update failed for "${h.title}": ${updateError.message}; skipped`);
      failed += 1;
      continue;
    }
    updated += 1;
  }

  // Anything stored but no longer in the file. Never deleted — closed, with
  // the reason recorded, so a task that vanishes because someone reworded a
  // heading leaves a trace rather than evaporating.
  let closed = 0;
  for (const [ref, prior] of byRef) {
    if (seenRefs.has(ref)) continue;
    const patch: Record<string, unknown> = { external_status: 'gone', synced_at: now };
    // An edited task is yours: the same edited_at contract as above, so the
    // sync neither closes it nor overwrites the why you wrote. "Gone" here
    // also covers "no longer assigned to you", so the reason says both.
    if (prior.status === 'todo' && !prior.edited_at) {
      patch.status = 'done';
      patch.why = 'closed by sync — gone from source, or no longer marked [@eric]';
    }
    const { error: closeError } = await db.from('tasks').update(patch).eq('id', prior.id);
    if (closeError) throw new Error(`Close failed: ${closeError.message}`);
    closed += 1;
  }

  return { created, updated, closed, failed, duplicates: dropped.length };
}
