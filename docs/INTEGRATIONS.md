# Integrations

## Supabase
- Auth + Postgres backing store.
- Configured via `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## OpenAI (Server-only scaffold)
- `/api/ai` reads persona/soul context and returns a stub response if `OPENAI_API_KEY` is missing.
- No outbound model call is implemented yet.

## Deployment
- README mentions Vercel as a deployment option. No Vercel config is checked in.
