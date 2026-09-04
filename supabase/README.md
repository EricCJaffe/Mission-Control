# ⛔ Do not run `supabase db push` from this repo

The CLI here is linked to the **shared** project `uivawtdmxqutqelwibra`, which is
where Mission Control's data actually lives — in the **`mission`** schema, next
to FinanceOS in `public` and shared identity in `core`. The link was repointed
2026-09-04; it had been left on the retiring project `npxirjaawlpubrtjovpy`.

**The 87 files in `migrations/` no longer describe that database.** They were
written for the old project, where Mission Control owned `public`. Thirty-four
of them create tables with an explicit `public.` prefix and not one mentions
`mission.`. Pushed against the shared project they would not fail loudly — they
would create Mission Control's tables *inside FinanceOS's schema*.

So the ledger and the files disagree on purpose, and the CLI cannot tell:

| | |
| --- | --- |
| Safe | `supabase migration list`, `db pull`, `gen types`, anything read-only |
| **Never** | `db push`, `db reset`, `migration up` |

The `mission` schema arrived by copy during the phase 1–5 migration and has **no
migration row in the shared project's ledger at all**, so it also cannot be
rebuilt from this directory. Closing that gap — squashing these 87 files into a
`mission`-schema baseline and registering it — is real work and belongs in a
deliberate session, not in passing. Until then, schema changes go through
`apply_migration` with a matching file committed here.

See `docs/DECISIONS/0010-mission-control-into-shared-database.md`.
