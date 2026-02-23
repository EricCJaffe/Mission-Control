# 0005 Book Writer AI + Vector Chunks in Supabase

## Date
2026-02-23

## Status
Accepted

## Context
The repository now includes a full Book Writer module with chapter versioning, comments/proposals, AI chat utilities, and retrieval-oriented chunk storage (`chapter_chunks.embedding vector(1536)`). This needs an explicit architectural record.

## Decision
Use Supabase as the system of record for Book Writer workflows, including:
- Book/chapter/version/comment/proposal/chat persistence.
- Vector-capable `chapter_chunks` storage for AI context retrieval.
- Server route handlers that call OpenAI through a shared helper (`src/lib/openai.ts`).

## Consequences
- Book authoring and AI context stay user-scoped under RLS and consistent ownership policies.
- The app depends on `OPENAI_API_KEY` for advanced writing features.
- The system has a clear path to embedding-based retrieval without introducing a separate vector datastore.

## Links
- `supabase/migrations/20260220210000_book_writer_module.sql`
- `supabase/migrations/20260221121500_book_module_upgrades.sql`
- `src/lib/openai.ts`
- `src/app/api/ai/chat/route.ts`
