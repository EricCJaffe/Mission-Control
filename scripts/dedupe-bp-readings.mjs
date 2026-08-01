#!/usr/bin/env node
/**
 * Removes blood-pressure readings duplicated across sources.
 *
 * Withings is the source of truth for BP. The same cuff reading can reach the
 * app twice — once from the Withings API with its real measurement time, and
 * once via Apple Health, which flattens it to local midnight. The differing
 * timestamps defeat any exact-match dedupe, so this matches on
 * (day, systolic, diastolic) instead and keeps the Withings row.
 *
 * The Apple Health ingest no longer writes BP at all, so this is only needed
 * to clean up rows written before that rule existed — in particular after a
 * Withings backfill lands on top of previously-imported Apple readings.
 *
 * Usage:
 *   node --env-file=.env.local scripts/dedupe-bp-readings.mjs          # dry run
 *   node --env-file=.env.local scripts/dedupe-bp-readings.mjs --apply  # delete
 */

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const KEEP_SOURCE = 'Withings';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.APPLE_HEALTH_USER_ID;

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (!userId) {
  console.error('APPLE_HEALTH_USER_ID is required (the user whose readings to dedupe).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: readings, error } = await supabase
  .from('bp_readings')
  .select('id,reading_date,systolic,diastolic,source')
  .eq('user_id', userId)
  .order('reading_date');

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

// Group by the things that identify a reading regardless of when it was stamped.
const groups = new Map();
for (const r of readings) {
  const key = `${r.reading_date.slice(0, 10)}|${r.systolic}|${r.diastolic}`;
  const list = groups.get(key);
  if (list) list.push(r);
  else groups.set(key, [r]);
}

const toDelete = [];
for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  const keepers = rows.filter((r) => r.source === KEEP_SOURCE);
  // Nothing authoritative in this group — leave it alone rather than guessing.
  if (keepers.length === 0) continue;

  // Only ever drop rows from a DIFFERENT source. Two readings from the same
  // source with identical values are a genuine repeat measurement, not a
  // duplicate — taking BP twice a few minutes apart is normal practice, and
  // an identical result is entirely plausible. Real example: 2024-12-20 had
  // two Withings readings of 135/87 six minutes apart, differing only in
  // whether pulse was captured.
  for (const r of rows) {
    if (r.source !== KEEP_SOURCE) {
      toDelete.push({ ...r, groupKey: key, keptId: keepers[0].id });
    }
  }
}

console.log(`${readings.length} readings, ${groups.size} distinct (day, systolic, diastolic)`);
console.log(`${toDelete.length} duplicate row(s) to remove\n`);

for (const r of toDelete) {
  console.log(
    `  ${r.groupKey.padEnd(22)} drop ${r.source.padEnd(14)} ${r.reading_date.slice(11, 16)}  (id ${r.id.slice(0, 8)})`
  );
}

if (!toDelete.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to delete these rows.');
  process.exit(0);
}

const { error: deleteError } = await supabase
  .from('bp_readings')
  .delete()
  .in(
    'id',
    toDelete.map((r) => r.id)
  );

if (deleteError) {
  console.error('Delete failed:', deleteError.message);
  process.exit(1);
}
console.log(`\nDeleted ${toDelete.length} duplicate reading(s).`);
