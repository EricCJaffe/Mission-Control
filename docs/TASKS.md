# Tasks

## TODO
- Provide a custom Soul narrative (beyond the default scaffold) and update the `soul` note.
- Confirm research notes statuses and color badges are correct after migration.
- Complete migration history alignment in Supabase (ensure `supabase db push` is clean).

## Explicit TODOs Found In Repo
- `README.md`
  - If you want a custom Soul narrative (beyond the default scaffold), provide the text and update the `soul` note.
- `src/app/api/ai/README.md`
  - Add `OPENAI_API_KEY` (server-only) and wire real model calls for the scaffolded `/api/ai/*` module.

## Backlog Ingestion
- Ingest `MISSION_CONTROL_STARTER_BACKLOG.md` into product planning and map to modules.
- Derive data model changes needed for goals, reviews, metrics, calendar, and recurring tasks.
- Define alignment scoring rules and drift flags based on survey inputs.
- Design "Today" dashboard layout (priority matrix + top 3 + calendar day view + tasks + habits).
- Define task categories and recurrence rules (God/Health/Family/Impact/Admin/Writing).
- Define calendar event types and linking (goals/tasks/notes/review outcomes).
- Define Monthly Review workflow and survey storage.
- Define automation rules for survey triggers (Digital Sabbath, date night, training blocks, deep work blocks, idol reflection).

## Next Feature Sets (Draft)
- Home dashboard with Priority Matrix, Today view, and Alignment banner.
- Tasks v2: categories, recurrence, and "why" alignment field.
- Calendar module with recurring events and linkable items.
- Monthly Review + Survey + Alignment scoring + archive.
- Metrics dashboard (minimal, non-vanity).

## Remaining (Auto)
- Add task categories and recurrence rules (Tasks v2).
- Add calendar recurring events and linking to goals/notes/reviews.
- Add survey execution scoring history and charts.
- Add SOP due dates or schedules for "behind" detection (currently done/not done).
- Add proactive alerts on login (email/push optional).
- Add AI helpers (monthly review summarizer, automation architect, sermon outline helper).

## Book Writer (Remaining)
- Implement chapter-level apply that can replace content (not only append) when AI proposals specify a structured patch.
