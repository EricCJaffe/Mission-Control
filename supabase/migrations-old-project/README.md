# Migrations for the retired project — history, not instructions

These 87 files built Mission Control's schema in **`npxirjaawlpubrtjovpy`**, the
project it lived in until 2026-09-04. There, Mission Control owned `public`, and
34 of these files say `public.` in as many words.

They are kept because they are the only written record of how the schema came to
be, and because reading them is often the fastest way to answer "why is this
column like that". They are **not** a description of the database this repo now
talks to.

## Why they are not in `migrations/`

Mission Control now lives in the `mission` schema of the shared project
`uivawtdmxqutqelwibra`, where **`public` is FinanceOS**. Several table names —
`tasks`, `projects`, `notes` — exist in both schemas.

So `supabase db push` with these files in the active directory would not fail.
It would create Mission Control's tables *inside FinanceOS's schema*, quietly,
and both apps would keep working until something read the wrong `tasks`.

Moving them here removes that possibility rather than warning about it. The
warning had been in `supabase/README.md` since 2026-09-04 and warnings are only
as good as the person reading them at 1am.

## Do not "restore" them

If you find yourself wanting these back in the active directory, what you
actually want is a `mission`-qualified baseline generated from the live schema.
That is a different artefact. See `supabase/README.md` for why it has not been
written yet and what it would take.
