# Migrations, and why `supabase db push` cannot work from here

The CLI is linked to the **shared** project `uivawtdmxqutqelwibra`, where
Mission Control lives in the **`mission`** schema, next to FinanceOS in `public`
and shared identity in `core`. The link was repointed 2026-09-04; it had been
left on the retiring project `npxirjaawlpubrtjovpy`.

## The thing that is actually wrong, discovered 2026-09-05

**One database has one migration ledger, and two repos are writing to it.**

`supabase_migrations.schema_migrations` is a single table per database, not per
schema and not per repo. FinanceOS pushes migrations to this project. So does
anyone touching `core`. Mission Control is a third writer. As of 2026-09-06 the
ledger holds 53 rows and **47 of them are not ours** — the `001`–`016` ordinals,
the August timestamp series, and FinanceOS's September work. `npm run db:ledger`
prints the current split rather than a count that goes stale in this file.

That is why `db push` from this repo reports
`LegacyDbPushMissingLocalError`: 47 remote versions have no local file, and
never will, because their files live in `~/dev/financeos`.

This was misdiagnosed for a day as "the migration files are stale". Squashing
them into a baseline would not have fixed it. Two repos cannot both drive
`db push` against one database, however tidy each repo's own history is.

### ⛔ Never run the repair the CLI suggests

The error helpfully offers:

    supabase migration repair --status reverted 001 002 003 … 20260905130000

**Those are FinanceOS's applied migrations.** Marking them reverted would make
`~/dev/financeos`'s next `db push` re-apply forty-five migrations against a
database that already has them. Do not run it, and do not let it be pasted in
because the CLI printed it.

## What to do instead

Schema changes go through `apply_migration` (or `execute_sql`) against the
`mission` schema, **with the matching file committed here in the same breath**,
and the ledger row written under the version in the filename so the two agree.
That is how `20260905180000`–`20260905180200` were applied.

Every statement in a migration here must be schema-qualified `mission.`.
`tasks`, `projects` and `notes` all exist in `public` too, and an unqualified
statement finds FinanceOS's copy without complaining.

| | |
| --- | --- |
| Safe | `migration list`, `gen types`, anything read-only |
| Safe, and run it | `npm run db:ledger` — see below |
| Fails loudly, harmless | `db push` — 47 foreign versions, so it refuses |
| **Never** | `migration repair --status reverted` on anything you did not write |
| **Never** | `db reset --linked` — it would drop FinanceOS |

## `npm run db:ledger` — the check that catches the silent half

`db push` refusing to run is the *loud* half of the collision, and it is
harmless. The dangerous half is silent, and there are exactly two shapes of it:

- a migration applied through `apply_migration` with **no file committed here**,
  so the schema moves and the repo does not know;
- a migration of ours that writes into **`public`** — `tasks`, `projects` and
  `notes` exist in both schemas, so an unqualified statement finds FinanceOS's
  copy and succeeds.

`npm run db:ledger` reads the remote ledger (one read-only `SELECT` over the
Management API) and reconciles it against `supabase/migrations/`. It sorts every
row into ours-and-filed, **ours-and-unfiled**, **ours-but-cross-schema**, or
another project's — and it lints the local files for unqualified relations
before they are ever applied. It exits non-zero only on the middle two, so
FinanceOS's forty-odd rows are reported and never counted as our failure.

Run it after applying anything, and before pushing.

## Can the two repos just have separate ledgers? No — this was checked

The obvious fix is to point each repo at its own migration history table. **The
Supabase CLI cannot do that**, verified on 2026-09-06 against CLI 2.116.0 two
ways:

- every statement in the shipped binary hardcodes the table, e.g.
  `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations`,
  `INSERT INTO supabase_migrations.schema_migrations(version, name, statements)`,
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`.
  There is no flag on `db push`/`migration`, no `config.toml` key, and no env var;
- the Supabase docs describe it as "the `supabase_migrations.schema_migrations`
  table created automatically on the remote database" — one per database, not
  per schema and not per repo.

So the ledger stays shared and `db push` stays unusable from both repos. That is
a property of one-database-two-projects, not a misconfiguration to be fixed. The
discipline in this file plus `npm run db:ledger` is the mitigation, and it is the whole
of it.


## Directory layout

| | |
| --- | --- |
| `migrations/` | The `mission`-schema migrations, from 2026-09-05 onward. All six are recorded in the remote ledger under their own filename version; `npm run db:ledger` proves it. |
| `migrations-old-project/` | The 87 files that built the schema in the retired project. History; see its README. |

## The gap that is still open

The `mission` schema arrived by copy during the phase 1–5 move and **no file in
this repo can rebuild it from nothing**. The six migrations here are
increments on top of a schema they did not create.

Closing that needs a baseline dumped from the live schema —
`supabase db dump --schema mission`, or `pg_dump`, both of which want the
database password that is not on this box. A baseline hand-written from
`information_schema` would be worse than none: it would look authoritative
while quietly missing a trigger.

Until then this repo can change the schema but cannot recreate it. That is worth
knowing before relying on it for disaster recovery.

See `docs/DECISIONS/0010-mission-control-into-shared-database.md` and
`docs/runbook.md`.
