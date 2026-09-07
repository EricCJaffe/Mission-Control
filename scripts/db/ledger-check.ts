#!/usr/bin/env node
/*
 * Does the shared migration ledger still agree with this repo?
 *
 *   npm run db:ledger
 *
 * Read-only. It runs one SELECT against `supabase_migrations.schema_migrations`
 * through the Management API and compares the result with `supabase/migrations/`.
 * It never writes to the database, and it will never suggest
 * `migration repair --status reverted` — that command, on this database, would
 * tell FinanceOS to re-apply forty-five migrations it has already applied.
 *
 * Exit code is 1 when something in THIS repo needs fixing: a change we made
 * with no file committed, a file of ours that writes into someone else's
 * schema, or an unqualified relation that would resolve to `public`.
 * FinanceOS's rows are reported and never counted as failures.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  reconcile,
  versionOf,
  unqualifiedRelations,
  isBlocking,
  OUR_SCHEMA,
  type LedgerRow,
  type LocalFile,
  type Finding,
} from './lib/ledger.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/*
 * The token lives in the machine's shared secrets file rather than this repo.
 * Reading it here, instead of demanding the caller export it, is what makes
 * `npm run db:ledger` work with no preamble — the same reason the sync CLI
 * reads its own env file.
 */
function accessToken(): string {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN;
  if (fromEnv) return fromEnv;

  const tokensEnv = join(homedir(), '.config', 'devenv', 'tokens.env');
  if (existsSync(tokensEnv)) {
    for (const line of readFileSync(tokensEnv, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?SUPABASE_ACCESS_TOKEN\s*=\s*(.*)$/.exec(line);
      if (m && m[1]) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error(
    'SUPABASE_ACCESS_TOKEN is not set and ~/.config/devenv/tokens.env does not define it.',
  );
}

function projectRef(): string {
  const fromEnv = process.env.SUPABASE_PROJECT_REF;
  if (fromEnv) return fromEnv;
  const refFile = join(ROOT, 'supabase', '.temp', 'project-ref');
  if (existsSync(refFile)) return readFileSync(refFile, 'utf8').trim();
  throw new Error('No SUPABASE_PROJECT_REF and no supabase/.temp/project-ref. Run `supabase link`.');
}

async function fetchLedger(): Promise<LedgerRow[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef()}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'select version, coalesce(name, \'\') as name, statements ' +
          'from supabase_migrations.schema_migrations order by version',
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as LedgerRow[];
}

function readLocal(): LocalFile[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const out: LocalFile[] = [];
  for (const filename of readdirSync(MIGRATIONS_DIR).sort()) {
    const version = versionOf(filename);
    if (!version) continue;
    out.push({ version, filename, sql: readFileSync(join(MIGRATIONS_DIR, filename), 'utf8') });
  }
  return out;
}

const LABEL: Record<Finding['verdict'], string> = {
  'ours-ok': 'OK',
  'ours-unfiled': 'UNFILED',
  'cross-schema': 'CROSS-SCHEMA',
  foreign: 'foreign',
  'local-only': 'LOCAL-ONLY',
  unclassifiable: 'unknown',
};

function section(title: string, rows: Finding[]): void {
  if (rows.length === 0) return;
  console.log(`\n${title}`);
  for (const f of rows) {
    console.log(`  ${LABEL[f.verdict].padEnd(13)} ${f.version}  ${f.name}`);
    console.log(`  ${' '.repeat(13)} ${f.detail}`);
  }
}

async function main(): Promise<void> {
  const [remote, local] = [await fetchLedger(), readLocal()];
  const findings = reconcile(remote, local);

  // The qualification lint runs on the files themselves, not on the ledger, so
  // it catches a bad migration before it is ever applied.
  const unqualified = local
    .map((f) => ({ file: f, relations: unqualifiedRelations(f.sql) }))
    .filter((x) => x.relations.length > 0);

  const by = (v: Finding['verdict']) => findings.filter((f) => f.verdict === v);

  console.log(`Shared ledger: ${remote.length} remote rows, ${local.length} local files`);
  console.log(`This repo owns the "${OUR_SCHEMA}" schema.`);

  section('Needs attention in this repo', [...by('ours-unfiled'), ...by('cross-schema')]);
  section('Local files never applied', by('local-only'));
  section("Other projects' rows — informational, never repair these", [
    ...by('foreign'),
    ...by('unclassifiable'),
  ]);

  if (unqualified.length > 0) {
    console.log('\nUnqualified relations in local migrations');
    console.log(`  Every statement must name ${OUR_SCHEMA}. explicitly — an unqualified`);
    console.log('  relation resolves by search_path and finds FinanceOS\'s copy.');
    for (const { file, relations } of unqualified) {
      console.log(`  ${file.filename}: ${relations.join(', ')}`);
    }
  }

  const ok = by('ours-ok').length;
  const blocking = findings.filter((f) => isBlocking(f.verdict)).length + unqualified.length;
  console.log(
    `\n${ok} of ours filed and clean, ${by('foreign').length + by('unclassifiable').length} not ours, ` +
      `${blocking} needing attention.`,
  );

  if (blocking > 0) {
    console.log(
      '\nApply schema changes with `apply_migration` AND commit the matching file\n' +
        'in the same breath, under the version the ledger recorded. See supabase/README.md.',
    );
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
