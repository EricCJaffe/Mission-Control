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

## Planned Integrations (Not Yet Implemented)
- Garmin Connect API
  - Purpose: sync activities from Garmin devices (watches, bike computers) into fitness module.
  - Status: Library functions exist in `src/lib/fitness/garmin-sync.ts` but OAuth client not implemented.
  - Would require: Garmin Health API credentials, OAuth flow implementation.
  - Tables ready: `workout_logs.garmin_activity_id` for deduplication.
