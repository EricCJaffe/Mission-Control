/* Smoke test for apple-health-normalizers against a stubbed Supabase client.
   Feeds a realistic Health Auto Export v2 payload through the importer and
   asserts it routes each domain correctly and stamps source='Apple Health'.
   Run: npx tsx scripts/verify-apple-health.ts */
import { importAppleHealthExport, type HAEExport } from '../src/lib/fitness/apple-health-normalizers';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, extra?: unknown) =>
  c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n, extra !== undefined ? JSON.stringify(extra) : ''));

// Records every write so we can assert on them.
const writes: Array<{ op: string; table: string; payload: unknown }> = [];

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.gte = chain; b.lte = chain; b.order = chain; b.limit = chain;
  b.insert = (payload: unknown) => { writes.push({ op: 'insert', table, payload }); return { select: () => ({ single: async () => ({ data: { id: 'new-id' }, error: null }), maybeSingle: async () => ({ data: { id: 'new-id' }, error: null }) }), then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) }; };
  b.update = (payload: unknown) => { writes.push({ op: 'update', table, payload }); return { eq: () => ({ eq: () => ({ then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) }), then: (r: (v: { data: null; error: null }) => void) => r({ data: null, error: null }) }) }; };
  // terminals return "not found" so importer takes the insert path
  b.single = async () => ({ data: null, error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  return b;
}
const supabase = { from: (table: string) => makeBuilder(table) } as never;

// Realistic Health Auto Export v2 payload
const payload: HAEExport = {
  data: {
    workouts: [
      { id: 'wk-1', name: 'Running', start: '2026-07-24 07:00:00 -0400', end: '2026-07-24 07:35:00 -0400',
        distance: { qty: 3.1, units: 'mi' }, activeEnergy: { qty: 320, units: 'kcal' },
        heartRate: { avg: { qty: 132 }, max: { qty: 148 } } } as never,
    ],
    metrics: [
      { name: 'sleep_analysis', units: 'hr', data: [ { date: '2026-07-24 00:30:00 -0400', qty: 7.2, source: 'Apple Watch', value: 'asleep' } as never ] },
      { name: 'step_count', units: 'count', data: [ { date: '2026-07-24 00:00:00 -0400', qty: 8450, source: 'iPhone' } ] },
      { name: 'weight_body_mass', units: 'lb', data: [ { date: '2026-07-24 06:45:00 -0400', qty: 178.4, source: 'Withings' } ] },
    ],
  },
};

(async () => {
  const results = await importAppleHealthExport(supabase, 'user-1', payload);

  console.log('\n--- import routed each domain ---');
  check('no domain threw errors', results.workouts.errors === 0 && results.sleep.errors === 0 && results.daily.errors === 0 && results.body.errors === 0, results);
  check('workout processed', results.workouts.imported + results.workouts.updated + results.workouts.skipped >= 1, results.workouts);
  check('sleep processed', results.sleep.imported + results.sleep.updated + results.sleep.skipped >= 1, results.sleep);
  check('daily (steps) processed', results.daily.imported + results.daily.updated + results.daily.skipped >= 1, results.daily);
  check('body (weight) processed', results.body.imported + results.body.updated + results.body.skipped >= 1, results.body);

  console.log('\n--- writes stamped source correctly ---');
  const wlInsert = writes.find(w => w.table === 'workout_logs' && w.op === 'insert');
  check('workout_logs insert happened', !!wlInsert, writes.map(w => w.table + ':' + w.op));
  check('workout carries import_source Apple Health', !!wlInsert && (wlInsert.payload as Record<string,unknown>).import_source === 'Apple Health', wlInsert?.payload);
  const anyAppleSource = writes.some(w => { const p = w.payload as Record<string, unknown>; return p && (p.source === 'Apple Health' || p.weight_source === 'Apple Health'); });
  check('at least one row stamped source=Apple Health', anyAppleSource);

  console.log('\n--- empty / malformed payloads do not throw ---');
  let threw = false;
  try {
    await importAppleHealthExport(supabase, 'u', {});
    await importAppleHealthExport(supabase, 'u', { workouts: [] });
    await importAppleHealthExport(supabase, 'u', { data: { metrics: [{ name: 'Unknown Metric', data: [] }] } } as never);
  } catch (e) { threw = true; console.log('threw:', e); }
  check('empty/unknown payloads handled', !threw);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
