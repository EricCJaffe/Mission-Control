#!/usr/bin/env node
/*
 * Fails when a screen renders a raw <table> instead of the shared DataTable.
 *
 * Eric, 2026-09-26: every table view "single line - clean - make sure it works
 * on mobile and desktop - enforce the rule". A rule on this estate holds only
 * when something checks it (~/dev/brain/docs/STANDARD-table-views.md), so this
 * runs in CI with the unit tests.
 *
 * The allowlist is for things that are genuinely not record lists (an HTML
 * email, a data-entry grid). Every entry carries its reason; an entry without
 * one is refused, because an unexplained exception is how the rule decays.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const SCAN = ['src/app', 'src/components', 'src/lib'];
const OWNER = 'src/components/ui/DataTable.tsx';
const ALLOW = JSON.parse(readFileSync(new URL('./allowlist.json', import.meta.url), 'utf8'));

const bad = Object.entries(ALLOW).filter(([, why]) => typeof why !== 'string' || why.trim().length < 15);
if (bad.length) {
  console.error(`allowlist entries need a real reason: ${bad.map(([p]) => p).join(', ')}`);
  process.exit(1);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

const offenders = [];
const used = new Set();
for (const dir of SCAN) {
  for (const f of files(join(ROOT, dir))) {
    const rel = relative(ROOT, f);
    if (rel === OWNER) continue;
    const hits = readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (/<table[\s>]/.test(line) ? [i + 1] : []));
    if (!hits.length) continue;
    if (ALLOW[rel]) used.add(rel);
    else offenders.push(`${rel}:${hits.join(',')}`);
  }
}

const stale = Object.keys(ALLOW).filter((p) => !used.has(p));
if (stale.length) console.warn(`allowlist entries with no <table> left (remove them): ${stale.join(', ')}`);

if (offenders.length) {
  console.error('Raw <table> in a screen. Use <DataTable> from src/components/ui/DataTable.tsx,');
  console.error('or, if this is genuinely not a list of records, add it to scripts/tables/allowlist.json with the reason:\n');
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(`tables: ok (${used.size} allowlisted)`);
