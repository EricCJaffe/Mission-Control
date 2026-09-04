# Mission Control -> shared `mission` schema

Tooling for `docs/DECISIONS/0010-mission-control-into-shared-database.md`.
Phases 1-4 were executed with these on 2026-09-03. Kept so the move is
reproducible and so Phase 5 can be rehearsed before it is run.

| script | phase | what it does |
|---|---|---|
| `run-sql.py <ref> <file-or-sql>` | all | POSTs SQL to the Management API. **Payload cap is between 2 MB and 3.2 MB** — measured, not documented. |
| `rewrite-dump.sh <schema.sql> <data.sql> <outdir>` | 2 | Rewrites `public` -> `mission` and re-keys the owner UUID. Asserts on its own output. |
| `split-inserts.py <data.sql> <outdir>` | 3 | Quote-aware splitter: chunks INSERTs under the payload cap, splitting oversized statements at row boundaries. Filters to `mission.*` only. |
| `copy-storage.py` | 4 | Copies `health-files` objects between projects, rewriting the user-prefixed path. |

## Capturing the dumps (no database password needed)

    npx supabase db dump --linked --schema public -f schema.sql
    npx supabase db dump --linked --data-only   -f data.sql

`--linked` provisions a short-lived `cli_login_postgres` role through the
Management API and connects without the database password. The `.dburl` files
the ADR originally called for are **not** required.

## Gotchas that cost time

- `db dump --data-only` is **not** public-only. It also emits `auth.users`,
  `auth.identities`, `auth.sessions`, `auth.refresh_tokens`,
  `auth.mfa_amr_claims`, `storage.buckets` and `storage.objects`. Loading those
  into a project where the user already exists fails on `users_pkey`.
  `split-inserts.py` filters them out.
- The data dump sets `session_replication_role = replica`, so **FK checks are
  skipped during load**. Validate every constraint afterwards; do not assume the
  load succeeding means the data is referentially sound.
- Rows contain newlines inside string literals, so INSERTs cannot be split on
  line boundaries. `split-inserts.py` tracks quote and paren state.
