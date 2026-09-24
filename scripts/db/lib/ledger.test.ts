/*
 * The ledger reconciler.
 *
 * These are the cases that actually happened in this database, written down so
 * they cannot happen quietly again: a migration applied with no file, a
 * migration of ours reaching into `public`, and an unqualified relation that
 * would find FinanceOS's copy of a table that exists in both schemas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  schemasTouched,
  unqualifiedRelations,
  reconcile,
  versionOf,
  isBlocking,
  type LedgerRow,
  type LocalFile,
} from './ledger.ts';

// --- schemasTouched --------------------------------------------------------

test('names the schemas a statement qualifies', () => {
  assert.deepEqual(schemasTouched('alter table public.entities drop constraint x;'), ['public']);
  assert.deepEqual(schemasTouched('create table mission.tasks (id uuid);'), ['mission']);
});

test('reports both schemas when a statement crosses', () => {
  const sql = 'insert into mission.tasks select id from public.tasks;';
  assert.deepEqual(schemasTouched(sql), ['mission', 'public']);
});

test('a table alias is not a schema', () => {
  // The whole reason for an allowlist: `t.` and `e.` must not read as schemas.
  assert.deepEqual(schemasTouched('select t.id, e.name from mission.tasks t join x e on 1=1'), [
    'mission',
  ]);
});

test('does not see schemas inside comments or string literals', () => {
  assert.deepEqual(schemasTouched('-- touches public.entities\nselect 1;'), []);
  assert.deepEqual(schemasTouched("select 'public.entities' as note;"), []);
  assert.deepEqual(schemasTouched('/* public.entities */ select 1;'), []);
});

test('supabase_migrations is not read as a known schema', () => {
  assert.deepEqual(schemasTouched('select version from supabase_migrations.schema_migrations'), []);
});

// --- unqualifiedRelations --------------------------------------------------

test('flags an unqualified relation', () => {
  // `tasks` exists in both schemas; unqualified, this finds FinanceOS's.
  assert.deepEqual(unqualifiedRelations('alter table tasks add column x int;'), ['tasks']);
});

test('accepts a properly qualified relation', () => {
  assert.deepEqual(unqualifiedRelations('alter table mission.tasks add column x int;'), []);
});

test('handles if-not-exists and insert forms', () => {
  assert.deepEqual(unqualifiedRelations('create table if not exists notes (id uuid);'), ['notes']);
  assert.deepEqual(unqualifiedRelations('insert into projects (id) values (1);'), ['projects']);
  assert.deepEqual(unqualifiedRelations('create table if not exists mission.notes (id uuid);'), []);
});

test('a policy name is not a relation', () => {
  // `create policy <name> on <relation>` — flagging the name would make the
  // check fire on every RLS migration and get ignored.
  assert.deepEqual(
    unqualifiedRelations('create policy tasks_owner on mission.tasks for select using (true);'),
    [],
  );
});

test('does not trip on "on update cascade"', () => {
  const sql =
    'alter table mission.tasks add constraint fk foreign key (p) references mission.projects(id) on update cascade;';
  assert.deepEqual(unqualifiedRelations(sql), []);
});

// --- reconcile -------------------------------------------------------------

const file = (version: string, filename: string, sql: string): LocalFile => ({
  version,
  filename,
  sql,
});
const row = (version: string, name: string, statements: string[] | null): LedgerRow => ({
  version,
  name,
  statements,
});

test('a filed migration that stays in mission is clean', () => {
  const findings = reconcile(
    [row('2026', 'sunday_church', ['alter table mission.tasks add column x int;'])],
    [file('2026', '2026_sunday_church.sql', 'alter table mission.tasks add column x int;')],
  );
  assert.equal(findings[0]?.verdict, 'ours-ok');
  assert.equal(isBlocking('ours-ok'), false);
});

test('a mission change with no local file is UNFILED and blocking', () => {
  const findings = reconcile([row('2026', 'ghost', ['alter table mission.tasks add column y int;'])], []);
  assert.equal(findings[0]?.verdict, 'ours-unfiled');
  assert.equal(isBlocking('ours-unfiled'), true);
});

test("another project's row is foreign, not a failure", () => {
  // This is 20260906192157_add_nonprofit_entity_type, verbatim in shape.
  const findings = reconcile(
    [row('20260906192157', 'add_nonprofit_entity_type', ['alter table public.entities drop constraint c;'])],
    [],
  );
  assert.equal(findings[0]?.verdict, 'foreign');
  assert.equal(isBlocking('foreign'), false);
});

test('one of ours that writes into public is CROSS-SCHEMA and blocking', () => {
  const sql = 'alter table public.entities add column z int;';
  const findings = reconcile([row('2026', 'oops', [sql])], [file('2026', '2026_oops.sql', sql)]);
  assert.equal(findings[0]?.verdict, 'cross-schema');
  assert.equal(isBlocking('cross-schema'), true);
});

test('a local file the ledger has never seen is LOCAL-ONLY', () => {
  const findings = reconcile([], [file('2026', '2026_pending.sql', 'select 1;')]);
  assert.equal(findings[0]?.verdict, 'local-only');
});

test('a row with no recorded statements is unclassifiable, not blamed on us', () => {
  const findings = reconcile([row('001', 'ancient', null)], []);
  assert.equal(findings[0]?.verdict, 'unclassifiable');
  assert.equal(isBlocking('unclassifiable'), false);
});

test('findings come back in version order', () => {
  const findings = reconcile(
    [row('20260906130000', 'b', ['select 1']), row('20260905180000', 'a', ['select 1'])],
    [],
  );
  assert.deepEqual(findings.map((f) => f.version), ['20260905180000', '20260906130000']);
});

// --- versionOf -------------------------------------------------------------

test('reads the version off a migration filename', () => {
  assert.equal(versionOf('20260906130000_sunday_church.sql'), '20260906130000');
  assert.equal(versionOf('README.md'), null);
  assert.equal(versionOf('not_a_migration.sql'), null);
});

test('a foreign key into auth is a dependency, not a write into another schema', () => {
  // Every table in `mission` owns its rows by `user_id references
  // auth.users(id)` — that is the RLS convention the whole schema is built on.
  // Reading it as a cross-schema write would make the check fire on correct
  // code, which is how a check stops being run.
  const sql = `create table mission.ideas (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      project_id uuid references mission.projects(id) on delete set null
    );`;
  assert.deepEqual(schemasTouched(sql), ['mission']);
});

test('a real write into another schema is still caught alongside a foreign key', () => {
  const sql = `create table mission.ideas (
      user_id uuid references auth.users(id)
    );
    insert into public.tasks (title) values ('oops');`;
  assert.deepEqual(schemasTouched(sql), ['mission', 'public']);
});

test('auth.uid() in an RLS policy is a session read, not a write into auth', () => {
  // Every policy in `mission` is written this way. If this flagged, the check
  // would fire on every RLS migration we will ever write.
  const sql = `alter table mission.ideas enable row level security;
    create policy ideas_owner on mission.ideas
      for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);`;
  assert.deepEqual(schemasTouched(sql), ['mission']);
});

test('a genuine write into auth is still caught', () => {
  const sql = `update auth.users set email = 'x' where id = '1';`;
  assert.deepEqual(schemasTouched(sql), ['auth']);
});

/*
 * Reading `auth` is not writing to it — the third shape of a fact this
 * checker has now had to learn three times.
 *
 * `20260920122731_reviews_module.sql` seeds one row per user and was reported
 * as CROSS-SCHEMA "writes into auth". It writes into `mission.review_areas`.
 * That flag was the last thing standing between the reviews branch and a
 * clean `db:ledger`, and a false verdict is worse than a noisy one.
 *
 * The distinction being asserted is `auth` versus a SIBLING schema. `public`
 * is FinanceOS on this same database, so a read of it is a real coupling and
 * stays reported — the test above this block pins that and must keep passing.
 */
test('insert ... select from auth.users is a read, not a write into auth', () => {
  const sql = `insert into mission.review_areas (user_id, key)
               select u.id, a.key from auth.users u cross join (values ('god_first')) as a(key);`;
  assert.deepEqual(schemasTouched(sql), ['mission']);
});

test('joining auth.users is a read', () => {
  const sql = `select t.id from mission.tasks t join auth.users u on u.id = t.user_id;`;
  assert.deepEqual(schemasTouched(sql), ['mission']);
});

test('reading a SIBLING schema is still reported', () => {
  // public is FinanceOS. Not the platform's, and not ours.
  const sql = `insert into mission.tasks (id) select id from public.tasks;`;
  assert.deepEqual(schemasTouched(sql), ['mission', 'public']);
});

test('DELETE FROM auth is still a write', () => {
  assert.deepEqual(schemasTouched(`delete from auth.users where id = '1';`), ['auth']);
});

test('DELETE FROM ours USING auth writes only ours', () => {
  const sql = `delete from mission.tasks t using auth.users u where u.id = t.user_id;`;
  assert.deepEqual(schemasTouched(sql), ['mission']);
});

// The maintenance migration's trigger, 2026-09-24: `of` is a column list, not
// a table, and was reported as an unqualified relation.
test('a trigger column list is not a relation', () => {
  assert.deepEqual(
    unqualifiedRelations('create trigger t after update of status, last_completed_at on mission.tasks for each row execute function mission.f();'),
    [],
  );
});
