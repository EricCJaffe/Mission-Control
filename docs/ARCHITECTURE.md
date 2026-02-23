# Architecture

## Overview
- Next.js App Router monolith with server components for page data and route handlers for mutations.
- Supabase-backed data/auth/storage with RLS as the core isolation boundary.
- UI composed with Tailwind and client components for interactive areas (editor boards, chat, task/notes UX).

## Runtime Shape
- App shell and navigation live in `src/app/layout.tsx` and `src/components/AppShell.tsx`.
- Logged-out users render a minimal layout without sidebar.
- `middleware.ts` protects authenticated product areas and handles login/dashboard redirects.
- Route handlers under `src/app/**/route.ts` implement writes, exports, uploads, and AI actions.

## Data Access
- Server data client: `src/lib/supabase/server.ts`.
- Browser data client: `src/lib/supabase/client.ts` and `src/lib/supabaseClient.ts`.
- Persistence is in Supabase Postgres with migrations under `supabase/migrations/`.

## Domain Modules
- Core planning: projects, tasks, notes, dashboard scores.
- Alignment planning: daily priorities, anchors, calendar events, monthly reviews.
- Goals + SOP: goal cycles/goals/goal-task links and SOP docs/checks.
- Book writer: books, chapters, versions, comments/proposals, milestones, uploads, research notes, AI chat threads/messages, chapter chunks, book proposals.
- Attachments: scoped file uploads/downloads for notes/tasks/books via storage + metadata table.

## AI Architecture
- Shared OpenAI helper in `src/lib/openai.ts`.
- AI routes:
  - `/api/ai/*` for chat/retrieve/patch/outline workflows.
  - `/books/ai/*` and comment-review routes for manuscript operations.
- Retrieval scaffolding stores chapter chunks with `vector(1536)` embeddings (`chapter_chunks`).
- `/api/ai` root route remains scaffold-oriented; other book/ai routes make direct OpenAI calls.
- Inline review queue supports bulk and selected apply/reject actions.

## Security Model
- Session identity comes from Supabase cookies.
- RLS policies enforce row ownership (`user_id` in core tables, `org_id` in book/attachment tables).
- Storage buckets are private and path-scoped with user-id folder prefix policies.

## Filesystem Coupling
- Knowledge and note vault export/import routes read/write local `vault/` directories.
- These features require writable server filesystem access in the runtime environment.

## Key Risks
- Mixed ownership column conventions (`user_id` vs `org_id`) increase migration/query consistency risk.
- AI features are sensitive to missing `OPENAI_API_KEY` and model/response-format assumptions.
- Filesystem-dependent routes may fail in immutable/serverless environments without writable storage.
