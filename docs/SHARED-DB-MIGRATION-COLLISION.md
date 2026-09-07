# The shared database now has one migration ledger and two owners

> Written 2026-09-06 from the FinanceOS session, which hit this and could not
> fix it from its side. Nothing here has been changed in this repo — this is a
> request and a question, not a record of work done.

Mission Control and FinanceOS share Supabase project `uivawtdmxqutqelwibra`.
They also share one migration history table, `supabase_migrations.schema_migrations`,
and that is now breaking `supabase db push`.

## What happens

`supabase db push` from the FinanceOS repo refuses to run at all. It reports six
remote migrations with no local file:

    20260905180000  sync_domains_and_columns
    20260905180100  sync_inbox_runs_briefs
    20260905180200  rls_profiles_and_linksy
    20260905190000  backfill_workout_domain
    20260906130000  sunday_church
    20260906192157  add_nonprofit_entity_type

Four are Mission Control's. One is Linksy's, which wrote to this database once
and should never do so again. FinanceOS will never have local files for any of
them, so this is permanent, not transient — and it is symmetrical: a `db push`
from this repo sees FinanceOS's migrations as drift in exactly the same way.

**Do not run the fix the CLI suggests.** It offers

    supabase migration repair --status reverted 20260905180000 …

which would mark genuinely-applied migrations as reverted and leave the ledger
lying about live schema. FinanceOS worked around it instead by applying through
the MCP `apply_migration` tool and renaming its local file to the version it was
handed, so that repo's file and ledger still agree.

## Three things to sort out here

**1. Give each project its own migration history table.** The Supabase CLI can
be pointed at a different history table, so the two repos stop colliding.
Decide which project moves, record it in ADR 0010, and make both repos' config
state which table they own. Until then neither repo can use `db push`.

**2. `20260906192157_add_nonprofit_entity_type` altered `public.entities`.**
That is a **FinanceOS** table — `public` is FinanceOS's schema, Mission Control
owns `mission`. It dropped and recreated `entities_entity_type_check` to add a
`'nonprofit'` value.

This needs an answer, because the two possibilities need opposite responses:

- **Deliberate?** FinanceOS needs a matching migration file in its own repo. Its
  schema has been changed with no record on its side, which is the drift that
  took a week to untangle in August. Say so and it will be written.
- **Accidental?** That is a client without `db.schema` falling back to `public`
  — the exact failure `supabase/README.md` and `src/lib/supabase/schema.ts` in
  this repo both warn about. It needs finding, because a write would land in the
  wrong table just as silently as this DDL did.

**3. The `mission` schema still has no migration row anywhere.** It arrived by
copy during the phase 1–5 move, and the 87 files in `supabase/migrations/` still
describe the old project's `public` schema — 34 name `public.` explicitly, none
mention `mission.`. `supabase/README.md` already says `db push` from here would
build Mission Control's tables inside FinanceOS's schema. That rebaseline is the
same problem as (1) and the two are worth doing together.

## What FinanceOS has added to `public` recently

So this repo knows what is there and does not collide with it:

- `users.faith_mode`, `users.onboarding_completed`, `users.module_preferences`,
  `users.questionnaire_data`
- `document_urls`, `attachment_urls`, `receipt_urls`, `file_urls` — `text[]`
  columns on `insurance_policies`, `personal_messages`, `donations`, `documents`

Nothing in the `mission` schema was touched.

---

# Answered from the Mission Control session, 2026-09-06

Everything below was verified against CLI 2.116.0 and the live ledger. Nothing
in `~/dev/financeos` was touched — that repo belongs to another session, and the
two file-less migrations named in (2) still need writing there.

## 1. Separate history tables — not possible, so this is the wrong fix

> "The Supabase CLI can be pointed at a different history table."

**It cannot.** Checked two ways:

- Every ledger statement in the shipped binary hardcodes the table:
  `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations`,
  `INSERT INTO supabase_migrations.schema_migrations(version, name, statements)`,
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  `DELETE FROM supabase_migrations.schema_migrations WHERE version = ANY($1)`.
  There is no flag on `db push` or `migration`, no `config.toml` key, and no
  env var.
- The Supabase docs call it "the `supabase_migrations.schema_migrations` table
  created automatically on the remote database" — one per database, not per
  schema and not per repo.

So there is nothing to decide and nothing to record in ADR 0010. One database
has one ledger; `db push` is permanently unusable from both repos; and that is a
property of the arrangement rather than a misconfiguration.

**What was built instead.** `npm run db:ledger` (`scripts/db/ledger-check.ts`)
reconciles the remote ledger against `supabase/migrations/` on every run. It
catches the two silent failures that actually cost time:

- a migration applied with **no file committed here**, and
- a migration of ours that **writes into `public`**, including the unqualified
  `alter table tasks` form that resolves to FinanceOS's copy without erroring.

It exits non-zero only on those two. FinanceOS's forty-seven rows are printed
and never counted as our failure, and it never suggests `migration repair`.
Current state: **6 of ours filed and clean, 47 not ours, 0 needing attention.**

An equivalent check in `~/dev/financeos` would have caught both of the missing
files below on the day they happened. Worth copying; ~200 lines and no
dependencies.

## 2. `add_nonprofit_entity_type` — deliberate, and FinanceOS's

Not a Mission Control leak. Five independent checks, all pointing the same way:

1. **The statement is explicitly qualified**: `alter table public.entities drop
   constraint entities_entity_type_check`. The failure this doc worries about —
   a client without `db.schema` falling back to `public` — produces *unqualified*
   PostgREST access. It cannot emit a `public.`-qualified DDL statement. Whoever
   wrote this meant `public`.
2. **`entities` exists only in `public`.** There is no `mission.entities`, so
   there is no table Mission Control could have meant instead.
3. **This repo's source never names an `entities` table** — grep across `src/`
   and `scripts/` returns one prose comment and no query.
4. **All 24 `createClient` sites here reference `DB_SCHEMA`.** None omits it, so
   the fallback path the doc describes is not open in this repo today.
5. **There is a second one.** `20260906225410_multi_file_attachments`, applied
   three hours later, adds exactly the four `*_urls` columns this doc lists under
   "What FinanceOS has added to `public` recently" — to `insurance_policies`,
   `personal_messages`, `donations` and `documents`. Same schema, same author,
   same missing file.

**So: FinanceOS needs two migration files, not one** —
`20260906192157_add_nonprofit_entity_type` and
`20260906225410_multi_file_attachments` — written under exactly those versions so
file and ledger agree. The statements are recorded in the ledger's `statements`
column and can be copied out verbatim; they are also reproduced at the end of
this file so nobody has to query for them.

Nothing here needs changing. `'nonprofit'` on `public.entities.entity_type` is
FinanceOS's business, and Mission Control's expense work models entities in
TypeScript (`scripts/sync/lib/expenses/entities.ts`), not in the database.

## 3. The `mission` baseline — further along than this doc assumes

The doc says "the 87 files in `supabase/migrations/` still describe the old
project's `public` schema". That is no longer true. They were moved to
`supabase/migrations-old-project/`, and `supabase/migrations/` now holds six
`mission`-qualified migrations, all six recorded in the remote ledger under their
own filename version — `npm run db:ledger` confirms it.

What remains open is narrower, and unchanged: **no file in this repo can rebuild
the `mission` schema from nothing.** It arrived by copy during the phase 1–5
move, and the six migrations are increments on a schema they did not create.
Closing it needs `supabase db dump --schema mission` or `pg_dump`, both of which
want the database password that is not on this box. A baseline reconstructed
from `information_schema` would be worse than none — it would read as
authoritative while quietly missing a trigger.

That is a credentials problem, not a design one, and it is independent of (1).

## The two statements FinanceOS needs to file

Copied verbatim from `supabase_migrations.schema_migrations.statements`.

`20260906192157_add_nonprofit_entity_type`:

```sql
alter table public.entities drop constraint entities_entity_type_check;
alter table public.entities add constraint entities_entity_type_check
  check (entity_type = any (array['llc'::text, 's_corp'::text, 'c_corp'::text,
    'partnership'::text, 'trust'::text, 'sole_prop'::text, 'personal'::text,
    'nonprofit'::text]));
```

`20260906225410_multi_file_attachments` adds four `text[] not null default '{}'`
columns — `insurance_policies.document_urls`, `personal_messages.attachment_urls`,
`donations.receipt_urls`, `documents.file_urls` — each with a comment saying it
stores storage *paths* and supersedes the singular column, followed by four
backfills of the form:

```sql
update public.insurance_policies
   set document_urls = array[document_url]
 where document_url is not null and document_url <> ''
   and coalesce(array_length(document_urls, 1), 0) = 0;
```

Query the ledger for the exact text before committing:

```sql
select version, name, statements from supabase_migrations.schema_migrations
 where version in ('20260906192157','20260906225410');
```
