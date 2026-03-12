# Environment

## Required Env Vars
- `NEXT_PUBLIC_SUPABASE_URL`
  - Used by browser/server Supabase clients and middleware.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Used by browser/server Supabase clients and middleware.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Required for server-side admin operations, migrations, signed URLs, health-processing routes, and Withings sync writes.
- `OPENAI_API_KEY`
  - Required for writing AI, health AI, command center, plans, morning briefing, genetics, imaging, hydration, and nutrition insights.
- `ENCRYPT_KEY`
  - Required for encrypted integration token storage.
- `WITHINGS_CLIENT_ID`
  - Required for Withings OAuth.
- `WITHINGS_CLIENT_SECRET`
  - Required for Withings OAuth token exchange and refresh.
- `WITHINGS_CALLBACK_URL`
  - Required for Withings OAuth redirect/callback handling.

## Optional Env Vars
- `WITHINGS_API_BASE_URL`
  - Defaults to `https://wbsapi.withings.net`.
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
- `APPLE_HEALTH_API_KEY`
  - Optional shared secret for Health Auto Export REST API automation. When set, the `/api/fitness/apple-health/import` endpoint accepts `X-API-Key` header auth instead of requiring a browser session. Used with `ADMIN_EMAIL` to resolve the user.

## Secrets Handling
- Keep secrets in `.env.local`.
- Never commit `.env.local`.
- Use `vercel env pull .env.local` to sync local environment from Vercel.

## Local Setup Notes
- `.env.local` is expected for local development.
- For Withings OAuth, point `WITHINGS_CALLBACK_URL` at the production or local callback you registered in the Withings developer console.
- If health/AI routes fail unexpectedly, verify Supabase and OpenAI keys first.
