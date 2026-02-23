# API

## Overview
- Internal APIs are Next.js App Router route handlers under `src/app/**/route.ts`.
- Most mutation routes are form-driven and return redirects.
- JSON APIs are primarily in `/api/ai/*` and selected utility handlers (for example chapter reorder/save).

## Auth and Access Pattern
- Handlers typically call `supabase.auth.getUser()` via `supabaseServer()` and require an authenticated user.
- Protected page access is enforced by `middleware.ts` for app routes.
- Data access is additionally constrained by Supabase RLS policies.

## JSON Endpoints
- `POST /api/ai`
  - Auth required.
  - Returns scaffold JSON; returns `501` when `OPENAI_API_KEY` is not configured.
- `POST /api/ai/chat`
  - Auth required.
  - Creates/uses chat thread + messages and calls OpenAI; returns JSON thread/message payload.
- `POST /api/ai/outline`
  - Auth required.
  - Returns outline JSON; can fallback to local outline generation if OpenAI call fails.
- `POST /api/ai/patch`
  - Auth required.
  - Applies chapter patch and returns `{ ok, markdown, persona }`.
- `POST /api/ai/retrieve`
  - Auth required.
  - Returns persona + retrieved context for chapter/book scopes.
- `POST /books/[id]/chapters/reorder`
  - Auth required.
  - JSON body with `ordered_ids`; returns `{ ok: true }`.
- `POST /books/chapters/save`
  - Auth required.
  - Accepts JSON or form data; returns JSON save/version status.
- `POST /books/chapters/comments/bulk-apply`
  - Auth required.
  - Accepts `comment_ids[]`, applies selected inline comments.
- `POST /books/chapters/comments/bulk-reject`
  - Auth required.
  - Accepts `comment_ids[]`, rejects selected inline comments.

## File/Download Endpoints
- `GET /attachments/[id]/download`
  - Downloads attachment content from Supabase Storage.
- `GET /notes/[id]/export`
  - Returns note markdown as downloadable file.
- `POST /notes/[id]/export-vault`
  - Writes a note markdown file to local `vault/notes` then redirects.
- `GET /books/[id]/export`
  - Exports book content as markdown or zip based on query params.
- `GET /books/[id]/chapters/[chapterId]/export`
  - Exports a single chapter markdown file.

## Core Redirect-Style Mutation Routes
- Auth/session: `/auth/callback`, `/auth/signout`
- Dashboard: `/dashboard/update`, `/dashboard/alignment`, `/dashboard/priorities`, `/dashboard/anchors`, `/dashboard/events`
- Projects/tasks/notes: `/projects/new`, `/tasks/new`, `/tasks/update`, `/notes/new`, `/notes/update`
- Knowledge: `/knowledge/save`, `/knowledge/export`, `/knowledge/import`
- Goals/reviews/SOPs: `/goals/new`, `/goals/cycles`, `/goals/link`, `/reviews/submit`, `/sops/new`, `/sops/update`, `/sops/steps`, `/sops/steps/toggle`
- Books: `/books/new`, `/books/update`, `/books/delete`, `/books/upload`, chapter/section/milestone/comment/proposal/book-proposal routes, and `/books/ai/*` helpers
- Attachments: `/attachments/upload`

## Error Behavior
- JSON endpoints use HTTP status codes (`400`, `401`, `500`, `501`) with JSON error payloads.
- Redirect-style handlers generally redirect on invalid input/auth failures.
- File endpoints return `404` responses when records/files are missing.
