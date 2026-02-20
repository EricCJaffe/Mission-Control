# Environment

## Required Env Vars
- `NEXT_PUBLIC_SUPABASE_URL`
  - Used by `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabaseClient.ts`, and `/health`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Used by the same Supabase client helpers.

## Optional Env Vars
- `OPENAI_API_KEY`
  - Server-only; used by `src/app/api/ai/route.ts` to gate AI responses.
- `ADMIN_EMAIL`
  - Used by `src/app/knowledge/page.tsx` to gate the Export button.

## Secrets
- Store secrets in `.env.local`. Do not commit it.
- `OPENAI_API_KEY` must never be exposed to the client.

## Local Setup Notes
- No OS-specific steps documented in repo.
