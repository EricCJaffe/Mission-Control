# Environment

## Required Env Vars
- `NEXT_PUBLIC_SUPABASE_URL`
  - Used by browser/server Supabase clients and middleware.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Used by browser/server Supabase clients and middleware.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Required for server-side admin operations, migrations, signed URLs, and some health-processing routes.
- `OPENAI_API_KEY`
  - Required for writing AI, health AI, command center, plans, morning briefing, genetics, imaging, hydration, and nutrition insights.
- `ENCRYPT_KEY`
  - Required for encrypted secret/config handling used in integrations.

## Optional Env Vars
- `OPENAI_MODEL`
  - Optional model override.
- `OPENAI_EMBEDDING_MODEL`
  - Optional embedding model override for embeddings utilities.
- `OPENWEATHER_API_KEY`
  - Required only for weather-aware fitness planning.
- `ADMIN_EMAIL`
  - Optional UI/admin gate for some internal tools.
- `GARMIN_EMAIL`
  - Optional for Garmin-related scripts or future sync work.
- `GARMIN_PASSWORD`
  - Optional for Garmin-related scripts or future sync work.

## Secrets Handling
- Keep secrets in `.env.local`.
- Never commit `.env.local`.
- Use `vercel env pull .env.local` to sync local environment from Vercel.

## Local Setup Notes
- `.env.local` is expected for local development.
- If health/AI routes fail unexpectedly, verify Supabase and OpenAI keys first.
