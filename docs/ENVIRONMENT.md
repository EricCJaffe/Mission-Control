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
- `APPLE_HEALTH_INGEST_TOKEN`
  - Bearer token the Health Auto Export iOS app sends to `/api/fitness/apple-health/ingest`.
  - Generate with `openssl rand -hex 32`. The route is fail-closed: if this is unset it
    returns 503 and accepts nothing.
- `CRON_SECRET`
  - Bearer token Vercel Cron sends to `/api/cron/*`. Generate with `openssl rand -hex 32`.
  - **Required**: both cron routes are fail-closed and return 503 without it, so the
    scheduled Withings sync and daily metric check simply won't run.
- `BIBLE_API_KEY`
  - API.Bible key, used to render reading-plan passages inline.
  - Without it, reading plans still work — they show references and a link out.
    Scripture text is never stored in the database, only fetched at render time.
- `BIBLE_VERSION_ID`
  - Optional. Defaults to NKJV (`63097d2a0a2f7db3-01`). Public-domain KJV is
    `de4e12af7f28f599-01` if the licensed key is ever unavailable.
- `BIBLE_API_BASE_URL`
  - Optional. Defaults to `https://rest.api.bible`.
- `APPLE_HEALTH_USER_ID`
  - Supabase `auth.users` id that ingested Apple Health rows are written for.
  - Required because the phone posts with no browser session, so the route writes with the
    service role and has no other way to know whose data it is.

## Secrets Handling
- Keep secrets in `.env.local`.
- Never commit `.env.local`.
- Use `vercel env pull .env.local` to sync local environment from Vercel.

## Local Setup Notes
- `.env.local` is expected for local development.
- For Withings OAuth, point `WITHINGS_CALLBACK_URL` at the production or local callback you registered in the Withings developer console.
- If health/AI routes fail unexpectedly, verify Supabase and OpenAI keys first.
