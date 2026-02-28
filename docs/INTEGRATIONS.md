# Integrations

## External APIs
- Supabase
  - Purpose: authentication, relational data, and file storage.
  - Auth/config: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- OpenAI Responses API (`https://api.openai.com/v1/responses`)
  - Purpose: writing assistant/chat, chapter outline generation, bulk edit suggestions, chapter placement/suggestion/review helpers, fitness AI (workout builder, morning briefing, lab analysis).
  - Auth: `OPENAI_API_KEY` (server-only) and optional `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`.
  - Integration helpers: `src/lib/openai.ts`, `src/lib/fitness/ai.ts`, `src/lib/ai/embeddings.ts`.
- OpenWeather API (`https://api.openweathermap.org/data/2.5/`)
  - Purpose: current weather and forecasts for fitness outdoor workout planning.
  - Auth: `OPENWEATHER_API_KEY` (server-only).
  - Integration helper: `src/lib/weather.ts`.
  - API route: `/api/fitness/weather`.

## Webhooks
- No inbound webhook integrations were found in this repository.

## Internal/Local Integrations
- Local vault filesystem integration (`vault/`)
  - Knowledge export/import and note export-to-vault routes write/read markdown files on disk.
- macOS `textutil` integration in `scripts/import_book_from_rtf.mjs`
  - Used to convert RTF input to text before inserting book/chapter data.

## Data Import Integrations (Implemented)
- Withings Health Mate Export
  - Purpose: Import historical health data (BP, weight, sleep, activity) from Withings Health Mate CSV exports.
  - Status: ✅ Fully implemented with UI at `/fitness/settings/withings`.
  - Integration helper: `src/lib/fitness/withings-import.ts`.
  - Components: `WithingsImportForm.tsx`.
  - API route: `/api/fitness/withings/cleanup` for duplicate handling.
  - Tables: `bp_readings`, `body_metrics`, `sleep_logs`, `daily_summaries`.
  - Migration: `20260228300000_withings_import_schema.sql`.
- Garmin Connect Export
  - Purpose: Import historical activities and health data from Garmin Connect CSV exports.
  - Status: ✅ Implemented with mass import UI at `/fitness/settings/garmin/mass-import`.
  - Integration helper: `src/lib/fitness/garmin-import.ts`.
  - Components: `GarminMassImportForm.tsx`.
  - API routes: `/api/fitness/garmin/mass-import`, `/api/fitness/garmin/fix-distances`.
  - Tables: `workout_logs`, `cardio_logs`, `body_metrics`, `sleep_logs`.
  - Supports: Activities CSV, DailySummaries CSV, weight CSV, sleep CSV.

## Planned Integrations (Not Yet Implemented)
- Garmin Connect OAuth API (Live Sync)
  - Purpose: Real-time sync activities from Garmin devices (watches, bike computers).
  - Status: Manual CSV import works; OAuth client not implemented.
  - Would require: Garmin Health API credentials, OAuth flow implementation.
  - Tables ready: `workout_logs.garmin_activity_id` for deduplication.
