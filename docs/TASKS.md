# Tasks

## TODO
- Provide a custom Soul narrative (beyond the default scaffold) and update the `soul` note.

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
- Implement real AI integration in /api/ai/* with OPENAI_API_KEY (server-only).
- Add diff/patch preview UI before apply (currently uses proposal block).
- Add chapter section-level patching via AI (scaffolded).
- Implement embeddings generation and similarity retrieval (pgvector).
- Add chat thread selector and thread history UI.
