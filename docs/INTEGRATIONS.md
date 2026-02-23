# Integrations

## External APIs
- Supabase
  - Purpose: authentication, relational data, and file storage.
  - Auth/config: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- OpenAI Responses API (`https://api.openai.com/v1/responses`)
  - Purpose: writing assistant/chat, chapter outline generation, bulk edit suggestions, chapter placement/suggestion/review helpers.
  - Auth: `OPENAI_API_KEY` (server-only) and optional `OPENAI_MODEL`.
  - Integration helper: `src/lib/openai.ts`.

## Webhooks
- No inbound webhook integrations were found in this repository.

## Internal/Local Integrations
- Local vault filesystem integration (`vault/`)
  - Knowledge export/import and note export-to-vault routes write/read markdown files on disk.
- macOS `textutil` integration in `scripts/import_book_from_rtf.mjs`
  - Used to convert RTF input to text before inserting book/chapter data.
