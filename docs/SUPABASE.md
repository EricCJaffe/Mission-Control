# Supabase

## Usage
- Auth and database are handled via Supabase.
- Server-side access uses `@supabase/ssr` in `src/lib/supabase/server.ts` and `middleware.ts`.
- Client-side access uses `@supabase/supabase-js` in `src/lib/supabase/client.ts` and `src/lib/supabaseClient.ts`.

## Schema (from `supabase/migrations/20260220175112_remote_schema.sql` and follow-on migrations)
- `projects` (title, description, status, priority, timestamps)
- `tasks` (title, description, status, priority, due_date, timestamps)
- `notes` (title, content_md, content_json, tags, timestamps)
- `dashboard_scores` (spirit, soul, body, updated_at, plus alignment/action fields from migration)
- `profiles` (display_name, created_at)
- `daily_priorities` (date, rank, domain, title, optional task link)
- `daily_anchors` (date, prayer, training, family_touchpoint)
- `calendar_events` (title, start/end, type, domain)
- `monthly_reviews` (period start/end, alignment score/status, drift flags, survey json)

## Auth
- `/login` uses email/password sign-in and sign-up.
- `/auth/callback` exchanges auth codes for sessions.
- `/auth/signout` clears sessions.

## RLS
- Row-level security is assumed per-user via `user_id`.
- New tables include owner policies in migrations.
