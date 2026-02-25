# Environment

## Required Env Vars
- `NEXT_PUBLIC_SUPABASE_URL`
  - Used by Supabase server/browser clients in `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabaseClient.ts`, and middleware.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Used by the same Supabase clients and middleware.

## Optional Env Vars (Feature-Dependent)
- `OPENAI_API_KEY`
  - Required for OpenAI-backed features in:
  - `src/lib/openai.ts`
  - Book AI routes (`/books/ai/*`, `/books/chapters/comments/*`, `/books/upload` heading-generation fallback)
  - Sermon AI routes (`/sermons/ai/*`)
  - Fitness AI routes (`/api/fitness/ai/*`, `/api/fitness/morning-briefing`, `/api/fitness/labs`)
  - `/api/ai/chat` and `/api/ai/outline`
  - If missing, `/api/ai` returns `501` scaffold response and OpenAI-backed handlers can fail/fallback.
- `OPENAI_MODEL`
  - Optional model override; defaults to `gpt-5.2` in book/sermon AI routes, `gpt-4o-mini` in fitness AI.
- `OPENAI_EMBEDDING_MODEL`
  - Optional embedding model override; defaults to `text-embedding-3-small` in `src/lib/ai/embeddings.ts`.
- `OPENWEATHER_API_KEY`
  - Required for weather integration in fitness module (`/api/fitness/weather`).
  - Used by `src/lib/weather.ts` to fetch current weather and forecasts.
- `ADMIN_EMAIL`
  - Optional UI gate for Knowledge export button in `src/app/knowledge/page.tsx`.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Required by `scripts/import_book_from_rtf.mjs` and `scripts/run-fitness-migration.mjs` (admin scripts only).

## Secrets
- Keep secrets in `.env.local` (not committed).
- Never expose server secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) to client code.

## Local Setup Notes
- `.env.local` is expected for local development.
- `src/app/health/page.tsx` displays Supabase URL and session status for quick connectivity checks.
