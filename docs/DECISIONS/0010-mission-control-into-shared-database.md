# 0010 Mission Control into the Shared Database

## Date
2026-09-02

## Status
**Phases 1-5 executed. Cut over 2026-09-04** — the app now runs on the shared
project. The old project is retained as the rollback and is no longer read or
written. Originally recorded as phases 1-4 on 2026-09-03: The `mission` schema is live in
the shared project with all 108 tables, 10,204 rows, 131 policies and all 45
storage objects. Mission Control still runs on its own project — nothing has
cut over. **Phase 5 (app cutover) has not been done and needs its own
confirmation from Eric.**

Rollback for everything done so far, in the shared project:

    drop schema mission cascade;
    delete from storage.objects where bucket_id in ('health-files','attachments','book_uploads');
    delete from storage.buckets where id in ('health-files','attachments','book_uploads');
    drop policy "mission_health_files_owner" on storage.objects;
    drop policy "mission_attachments_owner"  on storage.objects;
    drop policy "mission_book_uploads_owner" on storage.objects;

Tooling and per-script gotchas: `scripts/mission-migration/`.

> **Reconstruction note.** A version of this decision was written on 2026-09-01 as
> `docs/DECISIONS/0002-mission-control-into-shared-database.md`. That file never
> reached this repository — commit `5048fe2` added only the `docs/RELEASES.md`,
> `docs/TASKS.md` and `docs/SESSION-CHANGELOG.md` entries that describe it, and the
> name it claimed collides with the existing `0002-notes-vault-export.md`. This
> document is rebuilt from the surviving summary at `docs/SESSION-CHANGELOG.md:263`
> plus a fresh survey of both live databases on 2026-09-02. **Where the two
> disagree, the survey wins**; every such difference is called out under
> "Corrections to the 2026-09-01 summary". Numbered 0010 because the index in
> `docs/DECISIONS/README.md` already claims 0007–0009.

## Context

BibleOS ADR `0001-one-database-uuid-identity.md` decided the shape of the family:
**one Supabase project, one schema per app**, because merged → split is easy and
split → merged is not. It sequenced the work in four steps:

1. Re-key FinanceOS from email to `auth.uid()` — **done**
2. Build `core` — accounts, households, persons — **done** (8 tables live)
3. **Move Mission Control in as a `mission` schema — this document**
4. BibleOS becomes the auth origin and cross-app dashboard

Mission Control is deliberately last: it is personal data in the wrong region, and
a botched migration hurts only Eric.

The reason this is about capability and not just one login and one bill is that
health and financial data become queryable together. Nothing else about the move
earns the risk.

### Survey of both databases, verified 2026-09-02

| | Mission Control `npxirjaawlpubrtjovpy` | Shared `uivawtdmxqutqelwibra` |
|---|---|---|
| Region | `us-west-2` | `us-east-1` |
| Public tables | 108 | 53 (FinanceOS) |
| Approx. rows | ~10,200 | ~1,300 |
| `auth.users` | 1 — `96982dec-d682-4dd0-9498-1d2d226dab83` | 3 — Eric is `e22a6d93-9b90-444c-a77c-8c731424a92f` |
| RLS | 106 of 108 tables, 131 policies | per ADR 0001, re-keyed to `auth.uid()` |
| FKs to `auth.users` from `public` | **101 constraints across 97 tables** | — |
| Owner columns | `user_id` 79 tables · `org_id` 21 · `created_by` · `profiles.id` | `core` schema owns identity |
| `person_id` columns | 4 (`lab_panels`, `lab_results`, `medications`, `appointments`) | `core.persons` — 3 rows |
| Functions / triggers / views in `public` | 132 / 4 / 1 | — |
| Storage buckets | 3 — `book_uploads` (0), `attachments` (0), `health-files` (**45 objects**) | 1 — `documents` |
| Extensions | includes **`vector`** | **no `vector`** |
| Migrations | 87 applied remote, 84 files local → **3 remote-only** | — |

Three facts shape the plan:

- **Only `tasks` collides by name** between the two `public` schemas, and moving
  into a separate `mission` schema moots even that. Confirmed by set comparison of
  all 108 against all 53.
- **One user, so identity is a single UUID substitution.** `96982dec-…` becomes
  `e22a6d93-…`. This is the step that fails *silently*: RLS filters on the owner
  column, so a table missed by the substitution reads as empty rather than
  erroring, and an empty health table looks exactly like a feature that has no
  data yet.
- **`core` already exists and already models persons.** Mission Control's `people`
  table (Eric and Mary Jo, where Mary Jo has records but no login) is the same
  concept as `core.persons`. They should be reconciled, not duplicated — but not
  in this migration. See "Deliberately out of scope".

## Decision

Move Mission Control's `public` schema into a **`mission` schema inside
`uivawtdmxqutqelwibra`**, keeping Vercel projects, domains and repositories
separate. Unified data, independent deployment.

### Phase 1 — Capture

Dump `public` from Mission Control with `pg_dump` over the **session pooler**.
Capture the 3 remote-only migrations first (`supabase db pull`) — without them the
dumped schema is something this repository cannot rebuild.

### Phase 2 — Reshape

Rewrite the dump before it is loaded:

- `public` → `mission` throughout, including every `search_path` in all 132
  functions and the 4 trigger definitions.
- `create extension if not exists vector` in the shared project first. Five columns
  depend on it: `chapter_chunks.embedding`, `workout_logs.embedding`,
  `workout_templates.embedding`, `exercises.embedding`, `ai_insights.embedding`.
- Keep every FK to `auth.users`. They are an asset here, not an obstacle — see the
  correction below.

### Phase 3 — Load and re-key

Load into `mission`, then substitute the UUID across **all 97 tables that
reference `auth.users`**, not only the 79 carrying `user_id`. Drive the
substitution from the FK catalogue, not from a hand-written list:

```sql
select tc.relname, a.attname
from pg_constraint con
join pg_class tc on tc.oid = con.conrelid
join pg_namespace tn on tn.oid = tc.relnamespace
join pg_class fc on fc.oid = con.confrelid
join pg_namespace fn on fn.oid = fc.relnamespace
join unnest(con.conkey) k(attnum) on true
join pg_attribute a on a.attrelid = tc.oid and a.attnum = k.attnum
where con.contype = 'f' and fn.nspname = 'auth' and fc.relname = 'users'
  and tn.nspname = 'mission';
```

**Verification gate:** after the substitution, no row in `mission` may hold
`96982dec-d682-4dd0-9498-1d2d226dab83` in any owner column, and every table's row
count must match the source. Assert both before proceeding. A silent miss is the
failure mode this whole phase exists to catch.

### Phase 4 — Policies and storage

- Recreate all 131 RLS policies against `mission`. They key off `auth.uid()`, which
  resolves to the new UUID on its own.
- Copy the 3 buckets. `health-files` holds 45 objects under user-prefixed paths per
  ADR 0006, so **every object path embeds the old UUID and must be rewritten as it
  is copied** — `96982dec-…/x.pdf` → `e22a6d93-…/x.pdf`. The storage policies match
  the first path segment against `auth.uid()`; a path that is not rewritten becomes
  unreadable to its owner. Reconcile the row in `health_file_uploads` with the
  object it points at, in both directions, before declaring this phase done.

### Phase 5 — App cutover

Point `MC_SUPABASE_*` at the shared project, set the client's default schema to
`mission`, and add `mission` to the project's exposed schemas in the API settings —
PostgREST serves only `public` until it is listed. **Do not begin Phase 5 without
confirming with Eric.** Phases 1–4 are reversible with
`drop schema mission cascade`; Phase 5 is the point where the old project stops
being the source of truth.

### Deliberately out of scope

- **Reconciling `people` with `core.persons`.** Both model the same idea and they
  should converge, but doing it inside the move means two hard things failing
  together. Land the move, then reconcile.
- **The 21 `org_id` and 5 `created_by` columns.** They are legacy owner columns
  that duplicate `user_id`. Rename or drop them afterwards, under
  `docs/TASKS.md` → "Migrate the app from created_by to user_id".
- **Retiring `npxirjaawlpubrtjovpy`.** Leave it running and untouched until the
  shared copy has been the live one for long enough to trust. It is the rollback.

## Corrections to the 2026-09-01 summary

**"Zero foreign keys reference `auth.users` — the usual hardest part of this
migration does not exist here" is wrong.** Mission Control has **101 FK constraints
across 97 of its 108 public tables** pointing at `auth.users`. The finding appears
to have been carried over from the FinanceOS audit in BibleOS ADR 0001, where it is
true — FinanceOS keys off `created_by` text and has no `user_id uuid` at all.

This changes the plan in two ways, one for the worse and one for the better:

- **Worse:** the dump cannot be loaded without `auth.users` already holding the
  target UUID, and the FKs must survive the schema rewrite. Phase 2 gains work.
- **Better, and it is the bigger effect:** the FKs turn the silent failure into a
  loud one. Substituting to a UUID that does not exist in the shared `auth.users`
  raises a constraint violation instead of quietly reading as empty. Keep them.
  The verification gate in Phase 3 stays regardless — an FK catches a *wrong* UUID,
  not a *missed* table.

**"79 tables" understates the substitution.** 79 tables carry `user_id`, but the
owner column is `org_id` on 21 tables (the books, sermons and chat modules) and
`created_by` on 5, plus `profiles.id`. Ninety-seven tables need the substitution.

**Storage was not mentioned.** 45 objects in `health-files` carry the old UUID in
their paths. Phase 4 covers it.

**`vector` was not mentioned.** The shared project does not have the extension and
five columns need it.

## Consequences

- Health and financial data become queryable together — the point of the exercise.
- **The isolation the current split provides is given up — accepted 2026-09-02.**
  Today a FinanceOS mistake cannot reach lab results; afterwards it can, and the
  service-role key in either app acts as every user at once. Eric accepted this
  deliberately: cross-pollination across apps, keyed to one user, is the entire
  point of BibleOS — a single view of his whole life, where health, finances and
  practice can be read together. Isolation was never the goal; it was a side
  effect of three projects growing up separately.

  What this does **not** license: the boundary that still matters is between
  *users*, not between apps. Every table keeps RLS keyed to `auth.uid()`, and the
  shared project now holds three users, not one. The service-role key is the
  hazard — it acts as every user at once and bypasses RLS entirely, so a
  service-role query that forgets to filter by `user_id` now reaches Shilo's rows
  as well as Eric's. Filter by `user_id` yourself; nothing else will.
- One project, one bill, one region. Mission Control leaves `us-west-2`, which
  slightly increases latency from the east coast rather than decreasing it.
- Migration files in `supabase/migrations/` become `mission`-schema migrations from
  the cutover forward. The 84 existing files stay as the history of a schema that
  no longer exists under that name; do not rewrite them.
- `supabase db push` remains blocked until the 3 remote-only migrations are pulled.
  Use the Management API in the meantime, per `~/dev/BibleOS/docs/CONTROL-PLANE.md`.

## Execution record — 2026-09-03

Ran with `scripts/mission-migration/`. Verified counts, source -> target:

| | source | target | |
|---|---|---|---|
| Tables | 108 | 108 | every table matched row-for-row |
| Rows | 10,204 | 10,204 | zero per-table differences |
| Functions | 14 | 14 | |
| Triggers | 4 | 4 | |
| RLS policies | 131 | 131 | |
| Tables with RLS | 106 | 106 | |
| FKs to `auth.users` | 101 | 101 | |
| All FK constraints | 172 | 172 | **all validated post-load, 0 orphans** |
| `health-files` objects | 45 (32.41 MB) | 45 (32.41 MB) | paths re-prefixed |
| Old UUID in 289 uuid columns | — | **0** | |

FinanceOS was untouched throughout: still 53 public tables, 3 users, 16 objects
in `documents`.

### What the plan got wrong, found by executing it

1. **The `.dburl` files were never needed.** `supabase db dump --linked`
   provisions a short-lived `cli_login_postgres` role through the Management API
   and connects without the database password. The entire "Blocked on" section
   below was a false blocker.
2. **14 functions needed rewriting, not 132.** The other 118 belong to pgvector.
3. **pgvector is installed in `public`** in the source, so columns type as
   `public.vector(1536)`. A plain `public` -> `mission` rename would have
   repointed them at a type that does not exist. They are repointed at
   `extensions`, where the target now has the extension.
4. **`db dump --data-only` is not public-only.** It also emits `auth.users`,
   `auth.identities`, `auth.sessions`, `auth.refresh_tokens`,
   `auth.mfa_amr_claims`, `storage.buckets` and `storage.objects`. Loading them
   into the shared project failed on `users_pkey` — Eric already exists there.
   They are filtered out; storage is handled properly in Phase 4 instead.
5. **The re-key is better done in the dump file than as post-load UPDATEs.**
   5,408 occurrences replaced before loading, so the FKs validate it on insert
   rather than a missed table reading as empty.
6. **`session_replication_role = replica` in the dump disables FK checks during
   load**, which undercuts point 5 on its own. All 172 constraints were
   therefore validated explicitly afterwards.
7. **The Management API caps request bodies** somewhere between 2 MB and 3.2 MB.
   The data had to be chunked, splitting two oversized INSERTs at row
   boundaries — quote-aware, because rows contain newlines inside strings.

### A security finding, fixed rather than copied

The source `health-files` bucket policies were **unscoped** — four policies
keyed only on `bucket_id = 'health-files'`, with no user check. Harmless with
one user; not harmless in a project with three. They were **not** copied. The
target has owner-scoped policies matching `attachments` and `book_uploads` and
ADR 0006: `(storage.foldername(name))[1] = auth.uid()::text`. Every write path
in the app already builds `{user_id}/...`, so this is compatible.

**The same fix should be applied to the source project**, which still has the
permissive policies. Not done here — it is a change to a live app outside this
migration's scope.

### One pre-existing inconsistency, faithfully reproduced

`health_file_uploads` has a row from 2026-03-06 pointing at
`imaging/manual/cardiac-mri-function-hx-cabg-2026-03-03.txt`, which does not
exist in storage and never did. It is an orphan in the source too. Copied as-is
rather than silently dropped.

## Phase 5 — done 2026-09-04

Pre-flight: **verified there was no drift** before cutting over. Per-table row
counts were identical across all 108 tables, and `max(updated_at)` was identical
across the 55 tables that carry it — so nothing had been written to the old
database after the 2026-09-03 snapshot. Had there been drift, the snapshot would
have needed re-taking; row counts alone would not have caught an in-place edit.

What changed:

1. `mission` added to the shared project's exposed schemas. **`db_extra_search_path`
   was deliberately left as `public, extensions`** — adding `mission` there could
   change name resolution for FinanceOS, which has its own `tasks`.
2. All **13** Supabase client constructions now pass `db: { schema: DB_SCHEMA }`,
   with the name defined once in `src/lib/supabase/schema.ts`. Exhaustiveness is
   the whole point: a client that omits it falls back to `public`, which is
   FinanceOS, and because `tasks` exists in both schemas the query would succeed
   and return the wrong rows rather than erroring.
3. A `MissionClient` type replaced the bare `SupabaseClient` annotations across 6
   files, whose default schema generic is `public`.
4. `APPLE_HEALTH_USER_ID` still held the **old** owner UUID and would have written
   orphans on the first sync. Repointed with the three Supabase variables in both
   `.env.local` and Vercel (development, preview, production).

Verified before touching any environment variable: over REST, `mission.tasks`
returned Mission Control rows, `public.tasks` still returned FinanceOS rows, and
an anon request to `mission.tasks` returned `[]` with HTTP 200 — RLS intact.
After deploying, the production client bundle references `uivawtdmxqutqelwibra`
and contains **zero** references to the old project.

## Retiring the old project — staged, not yet started

`npxirjaawlpubrtjovpy` is the rollback. Retiring it is a sequence of increasingly
irreversible steps, and there is no reason to rush any of them.

1. **Soak.** Run on the shared database for at least two weeks of ordinary use —
   including one full cycle of the weekly and monthly things (Withings sync, the
   cron jobs, a health.md approval, an Apple Health sync).
2. **Confirm it is truly idle.** `max(updated_at)` across the old project's 55
   timestamped tables must stay frozen at the cutover values. Anything moving
   means a client is still pointed at it.
3. **Take a keepable backup** — `supabase db dump --linked` for schema and data,
   plus the 45 storage objects, stored **off** Supabase. A paused project is not
   a backup.
4. **Pause** the project. Reversible, and stops any cost.
5. **Delete** only after the backup has been proven restorable, and not before
   roughly 30 days of the paused state being uneventful.

Do not compress this. The migration verified cleanly, but "verified clean" and
"lived in for a month" are different kinds of confidence.

## Blocked on (superseded — see the execution record above)

- [x] ~~**Session-pooler connection strings**~~ — **not required.** See finding 1
      above. Left here for the record:
      `~/.config/supabase/mission-control.dburl` and `~/.config/supabase/shared.dburl`.
      Session pooler specifically — direct is IPv6-only from this box and the
      transaction pooler (6543) cannot dump a schema. The Management API cannot
      dump one either. Neither file exists yet.

      Run `~/.config/devenv/supabase-dburl-setup.sh` from a terminal; it writes
      both files and verifies each with `psql`. Everything but the password is
      already known, taken from each project's `supabase/.temp/pooler-url`:

      | | user | host | port |
      |---|---|---|---|
      | Mission Control | `postgres.npxirjaawlpubrtjovpy` | `aws-0-us-west-2.pooler.supabase.com` | 5432 |
      | Shared | `postgres.uivawtdmxqutqelwibra` | `aws-1-us-east-1.pooler.supabase.com` | 5432 |

      **The database password cannot be retrieved by anyone** — Supabase stores it
      hashed, and `GET /v1/projects/{ref}/config/database/pooler` returns the
      literal string `[YOUR-PASSWORD]` in place of it. It is either known already
      or it must be reset at Project Settings → Database. Resetting is safe:
      no environment variable on `mission-control`, `myfinancialplanner-ai` or
      `bibleos` carries a DB connection string, so nothing deployed depends on it.
- [x] ~~Eric's decision on the isolation trade-off~~ — **accepted 2026-09-02**,
      see Consequences.

## Links
- `~/dev/BibleOS/docs/decisions/0001-one-database-uuid-identity.md` — the parent decision
- `~/dev/BibleOS/docs/CONTROL-PLANE.md` — how to run SQL against either project
- `docs/SESSION-CHANGELOG.md` — 2026-09-01 entry, the source this reconstructs
- `docs/TASKS.md` — "Open at 2026-09-01 session close"
- `docs/DECISIONS/0006-private-storage-with-user-prefixed-paths.md` — why storage paths carry the UUID
- `docs/DECISIONS/0005-book-writer-ai-and-vector-chunks.md` — why `vector` is required
