/*
 * Parsing jobs/REGISTRY.md.
 *
 * The fixture is an abridged copy of the real file rather than a tidy
 * invention, because every awkward thing this parser handles is a real thing
 * that file does: a headerless second table, one project listing crons as a
 * table while three list them as wrapped prose, and a job name that is neither
 * backticked nor bold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputKeyFor, parseRegistry } from './registry.ts';

const REGISTRY = `# Scheduled work — the registry

Compiled 2026-09-07 by surveying the machine.

| Mechanism | Runs on | Can reach | Use it for |
|---|---|---|---|
| **Vercel cron** | Vercel, cloud | the app's own DB | DB-driven work |
| **systemd timer** | **ubuntu-dev** | the repos | judgement |

---

## On ubuntu-dev — systemd timers

| Job | When | What |
|---|---|---|
| \`mission-control-sync\` | every 2h, 06:00–22:00 daily | \`node scripts/sync/projects.ts\` in \`~/dev/mission-control\` |

| \`job-honey-lake-friday\` | **Fri 07:00** | Friday client update. Prompt: \`jobs/honey-lake-friday.md\`. Added 2026-09-07. |

Both run via \`jobs/run-job.sh <name>\`, which is generic.

---

## Vercel crons — 25 jobs across 4 projects

### mission-control (4)
| When | Path | What |
|---|---|---|
| \`0 11 * * *\` | \`/api/cron/withings-sync\` | health data |
| \`30 10 * * 1-5\` | \`/api/cron/brief?kind=daily\` | **daily briefing, weekdays 10:30** |

The brief engine is real code: \`src/lib/brief/{collect,generate}.ts\`,
surfaced at \`/brief\` and \`/briefs\`.

### financeos (3)
\`0 9 * * *\` \`/api/sync/all\` · \`0 13 * * 1-5\` \`/api/cron/refresh-prices\` ·
\`0 14 * * 1\` \`/api/identity/check-drift\`

### linksy (12) — the busiest by far
\`*/15 * * * *\` send-scheduled-emails · \`*/6h\` transfer-acknowledgment ·
\`0 9 * * *\` prospect-reminders

### trellisv2 (6)
\`*/15 * * * *\` send-scheduled-emails · \`0 2 * * 1\` child-welfare-snapshot

---

## Agents VM

| Job | When | State |
|---|---|---|
| Paperclip heartbeat | every 30s | running, but the Chief of Staff has **never completed a run** |

## Gaps this survey exposed

- **No job spans a client.** Nothing gathers GitHub + mail + calendar.
`;

const jobs = parseRegistry(REGISTRY);

test('ignores the explanatory table above the first job section', () => {
  // `| **Vercel cron** | Vercel, cloud | ... |` is documentation, not a job.
  assert.equal(jobs.some((j) => j.name.toLowerCase().includes('vercel cron')), false);
  assert.equal(jobs.some((j) => j.name === 'systemd timer'), false);
});

test('reads both systemd tables, including the one with no header', () => {
  const timers = jobs.filter((j) => j.mechanism === 'systemd_timer');
  assert.deepEqual(timers.map((j) => j.name), ['mission-control-sync', 'job-honey-lake-friday']);
  assert.equal(timers[0].host, 'ubuntu-dev');
  assert.equal(timers[0].cadence, 'every 2h, 06:00–22:00 daily');
});

test('picks the prompt path out of a description', () => {
  const friday = jobs.find((j) => j.name === 'job-honey-lake-friday');
  assert.equal(friday?.promptPath, 'jobs/honey-lake-friday.md');
});

test('the output key drops the unit prefix so the timer meets its brief', () => {
  // The timer is `job-honey-lake-friday`; run-job.sh writes
  // jobs/out/honey-lake-friday-2026-09-07.md. Only the prompt path joins them.
  const friday = jobs.find((j) => j.name === 'job-honey-lake-friday')!;
  assert.equal(outputKeyFor(friday), 'honey-lake-friday');
  assert.equal(outputKeyFor({ name: 'job-something', promptPath: null }), 'something');
});

test('reads the tabular Vercel project', () => {
  const mc = jobs.filter((j) => j.mechanism === 'vercel_cron' && j.project === 'mission-control');
  assert.deepEqual(mc.map((j) => j.name), ['/api/cron/withings-sync', '/api/cron/brief?kind=daily']);
  assert.equal(mc[0].schedule, '0 11 * * *');
  assert.equal(mc[0].host, 'vercel');
});

test('reads the prose Vercel projects, including wrapped lines', () => {
  const fin = jobs.filter((j) => j.project === 'financeos');
  assert.deepEqual(fin.map((j) => j.name), [
    '/api/sync/all',
    '/api/cron/refresh-prices',
    '/api/identity/check-drift',
  ]);
  // The third pair is on a continuation line; a line-at-a-time parser loses it.
  assert.equal(fin[2].schedule, '0 14 * * 1');
});

test('keeps a schedule that is not a cron expression, verbatim', () => {
  // `*/6h` is what the file says. Correcting it here would hide the fact that
  // the registry and the deployed cron may not agree.
  const job = jobs.find((j) => j.name === 'transfer-acknowledgment');
  assert.equal(job?.schedule, '*/6h');
});

test('drops the prose paragraph that merely contains backticks', () => {
  assert.equal(jobs.some((j) => j.name.includes('src/lib/brief')), false);
  assert.equal(jobs.some((j) => j.name === 'The'), false);
});

test('two projects scheduling the same cron name stay two jobs', () => {
  // linksy and trellisv2 both run `send-scheduled-emails`. Keying on the name
  // alone would render two real jobs as one, and the inventory would undercount.
  const both = jobs.filter((j) => j.name === 'send-scheduled-emails');
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((j) => j.project).sort(), ['linksy', 'trellisv2']);
  assert.equal(new Set(both.map((j) => j.sourceRef)).size, 2);
});

test('reads a bare, unformatted job name from the agents table', () => {
  const heartbeat = jobs.find((j) => j.mechanism === 'paperclip');
  assert.equal(heartbeat?.name, 'Paperclip heartbeat');
  assert.equal(heartbeat?.cadence, 'every 30s');
  assert.match(heartbeat?.state ?? '', /never completed a run/);
});

test('stops at the gaps section rather than reading its bullets as jobs', () => {
  assert.equal(jobs.some((j) => j.name.includes('No job spans')), false);
});

test('every source_ref is unique', () => {
  assert.equal(new Set(jobs.map((j) => j.sourceRef)).size, jobs.length);
});
