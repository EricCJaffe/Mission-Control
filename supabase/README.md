# Migrations, and why `supabase db push` cannot work from here

The CLI is linked to the **shared** project `uivawtdmxqutqelwibra`, where
Mission Control lives in the **`mission`** schema, next to FinanceOS in `public`
and shared identity in `core`. The link was repointed 2026-09-04; it had been
left on the retiring project `npxirjaawlpubrtjovpy`.

## The thing that is actually wrong, discovered 2026-09-05

**One database has one migration ledger, and two repos are writing to it.**

`supabase_migrations.schema_migrations` is a single table per database, not per
schema and not per repo. FinanceOS pushes migrations to this project. So does
anyone touching `core`. Mission Control is a third writer. As of 2026-09-05 the
ledger holds 48 rows, and **41 of them are FinanceOS's** — the `001`–`016`
ordinals and the August timestamp series.

That is why `db push` from this repo reports
`LegacyDbPushMissingLocalError`: 45 remote versions have no local file, and
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

| | |
| --- | --- |
| Safe | `migration list`, `gen types`, anything read-only |
| Fails loudly, harmless | `db push` — 45 foreign versions, so it refuses |
| **Never** | `migration repair --status reverted` on anything you did not write |
| **Never** | `db reset --linked` — it would drop FinanceOS |

Every statement in a migration here must be schema-qualified `mission.`.
`tasks`, `projects` and `notes` all exist in `public` too, and an unqualified
statement finds FinanceOS's copy without complaining.

## Directory layout

| | |
| --- | --- |
| `migrations/` | The `mission`-schema migrations, from 2026-09-05 onward. All three are recorded in the remote ledger under their own filename version. |
| `migrations-old-project/` | The 87 files that built the schema in the retired project. History; see its README. |

## The gap that is still open

The `mission` schema arrived by copy during the phase 1–5 move and **no file in
this repo can rebuild it from nothing**. The three migrations here are
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
