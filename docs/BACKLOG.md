# Mission Control Backlog Mapping

This doc maps `MISSION_CONTROL_STARTER_BACKLOG.md` to current modules, routes, and data models.

## Core Purpose
- Implemented across `src/app/dashboard`, `src/app/tasks`, `src/app/notes`, `src/app/reviews`, `src/app/metrics`, `src/app/calendar`.

## Home Page (Priority Matrix + Today + Alignment)
- Dashboard page: `src/app/dashboard/page.tsx`
- Alignment status + scores: `dashboard_scores`, `monthly_reviews`
- Today priorities + anchors: `dashboard_priorities`, `dashboard_anchors`

## Goals & Standards
- Goals/Cycles: `src/app/goals/page.tsx`, `goal_cycles` and `goals`
- SOPs: `sops` table + `src/app/sops/page.tsx`

## Calendar
- Calendar module: `src/app/calendar/page.tsx`
- Events + recurrence: `calendar_events`
- Linking: review_id + task_id + note_id (where present)

## Tasks
- Tasks v2: `tasks` with `category`, `why`, `recurrence_rule`, `recurrence_anchor`
- Subtasks + links: `task_subtasks`, `task_links`, `task_note_links`

## Notes / Knowledge
- Notes module: `src/app/notes/page.tsx`, `src/app/notes/[id]/page.tsx`
- Research notes in books: `research_notes` + book/chapters UI

## Reviews
- Monthly review flow: `src/app/reviews/new/page.tsx` + `src/app/reviews/submit/route.ts`
- Review archive + drift flags: `monthly_reviews`
- Quarterly/Annual templates: `src/app/reviews/quarterly` and `src/app/reviews/annual`

## Metrics
- Metrics dashboard: `src/app/metrics/page.tsx`
- Source tables: `dashboard_scores`, `monthly_reviews`

## Automation Triggers
- Auto-actions derived in `src/app/reviews/[id]/page.tsx` (phone discipline, training, deep work, idol reflection, etc.)

## AI Helpers (Book + System)
- Book AI: `/books/[id]/ai`, proposals queues, inline review, reorder, etc.
- System AI scaffold: `/api/ai/*`

## Sermon Builder (Planned)
- Create sermon series + sermon outline editor aligned to persona voice (outline-first vs chapters).
- Two-way conversion:
  - Series → Book draft outline
  - Book outline → Sermon series starter
- Automation outputs:
  - Small group leader guide
  - Participant guide
  - Daily devotional content
  - Social media content pack
- Link to Automation Architect outputs for workflow execution.

## Status Summary
- Implemented: Dashboard, Tasks v2, Calendar, Reviews, Metrics, Notes, Book Writer.
- Pending: AI helpers for monthly review summarizer, automation architect, sermon outline helper.
