# Integrations

## External Services
- Supabase
  - Purpose: auth, relational data, RLS, storage, signed URLs, migrations.
  - Auth/config: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - Used across app data, health files, workout photos, persisted AI outputs, and Withings connection/sync metadata.
- OpenAI Responses API
  - Purpose: writing assistant flows, health/fitness analysis, morning briefing, genetics, imaging, command center, training plans, hydration, nutrition, and appointment prep.
  - Auth: `OPENAI_API_KEY`.
  - Optional overrides: `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`.
  - Helpers: `src/lib/openai.ts`, `src/lib/fitness/ai.ts`, `src/lib/ai/embeddings.ts`.
- OpenWeather API
  - Purpose: weather-aware fitness planning.
  - Auth: `OPENWEATHER_API_KEY`.
  - Helper: `src/lib/weather.ts`.
  - Route: `/api/fitness/weather`.
- Vercel
  - Purpose: hosting, builds, environment management.
  - Project: `mission-control`.
  - Local sync: `vercel env pull .env.local`.
- Withings Public Health Data API
  - Purpose: OAuth-based sync for blood pressure, body composition, sleep, and daily summary metrics.
  - Auth/config: `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `WITHINGS_CALLBACK_URL`, optional `WITHINGS_API_BASE_URL`.
  - App routes: `/api/fitness/withings/status`, `/api/fitness/withings/connect/start`, `/api/fitness/withings/callback`, `/api/fitness/withings/sync`, `/api/fitness/withings/disconnect`.
  - Status: OAuth/manual sync implemented; webhooks deferred.

## Data Import Integrations
- Withings API + legacy export import
  - Status: implemented.
  - UI: `/fitness/settings/withings`.
  - Helpers: `src/lib/fitness/withings-client.ts`, `src/lib/fitness/withings-sync-service.ts`, `src/lib/fitness/withings-import.ts`.
  - Notes: API sync is for health metrics only; Garmin remains workout source of truth.
- Garmin CSV/FIT import
  - Status: implemented.
  - UI: `/fitness/settings/garmin/mass-import` and related import flows.
  - Helper: `src/lib/fitness/garmin-import.ts`.
  - Open gap: Garmin OAuth/live sync is not implemented.

## Health/Storage Integrations
- Supabase Storage bucket `health-files`
  - Used for lab PDFs, genetics reports, imaging references, and signed URL viewing.
- Supabase Storage workout photo handling
  - Used by workout history session photo uploads.

## Internal Integrations
- Local vault filesystem integration (`vault/`)
  - Used for export/import flows in knowledge/notes features.
- macOS `textutil`
  - Used by `scripts/import_book_from_rtf.mjs`.

## Not Implemented
- Garmin Connect OAuth live sync
- Email notification provider for pending `health.md` updates
- Withings webhook subscriptions
