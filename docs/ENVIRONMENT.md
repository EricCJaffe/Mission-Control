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

## Cross-project sync and the brief (added 2026-09-05)

### Required for the brief cron
- `CRON_SECRET`
  - Already present. `/api/cron/brief` fails closed without it, like the other crons.
- `MC_USER_ID`
  - Whose data the cron acts on. A cron request has no signed-in user, so the brief
    has to be told whose week it is. The app itself never reads this.

### Required for Outlook mail, calendar and delivering the brief
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_MAILBOX`
  - App-only Microsoft Graph credentials, client-credentials flow.
  - **Read `docs/m365-setup.md` §3 first.** Application permissions reach every
    mailbox in the tenant until an Exchange application access policy scopes them
    to one, and the secret lives on a dev box.
  - `Mail.Send` should stay ungranted until the reads have been verified.
  - Without these the brief still generates and is stored; it is simply not sent,
    and the reason is recorded on the row and shown at `/briefs`.

### Optional
- `ANTHROPIC_API_KEY`
  - Writes the narrative sections of the brief. Absent, the brief still renders
    with every number, table and link — only the prose is omitted. That is
    deliberate: a brief with no commentary is far better than no brief.
- `BRIEF_RECIPIENT`
  - Where the brief is sent. Falls back to `ADMIN_EMAIL`, then `MS_MAILBOX`.
- `DEV_ROOT`
  - Where the harvester looks for repos. Defaults to `~/dev`. Only read by the
    CLI on ubuntu-dev, never by the app.

### Where they live
`.env.local` for hand runs and for Vercel (via the dashboard), and
`~/.config/mission-control/sync.env` (mode 600) for the systemd timer — a user
service does not read `.env.local`. `.env.example` lists every variable.
