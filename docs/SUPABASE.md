# Supabase

## Usage
- Supabase is used for Auth, Postgres, and Storage.
- Server-side client: `src/lib/supabase/server.ts`
- Browser client: `src/lib/supabase/client.ts`
- Middleware auth/session checks: `middleware.ts`

## Auth
- Login and signup via `/login` using Supabase Auth.
- `/auth/callback` exchanges auth code for session.
- `/auth/signout` clears session.

## Schema (from `supabase/migrations/*`)
- Core tables: `projects`, `tasks`, `notes`, `dashboard_scores`, `profiles`
- Dashboard/review tables: `daily_priorities`, `daily_anchors`, `calendar_events`, `monthly_reviews`
- Goals/SOP tables: `goal_cycles`, `goals`, `goal_tasks`, `sop_docs`, `sop_checks`
- Book writer tables: `books`, `chapters`, `chapter_sections`, `chapter_versions`, `chapter_comments`, `chapter_proposals`, `book_uploads`, `book_milestones`, `research_notes`, `chat_threads`, `chat_messages`, `chapter_chunks`, `persona_profiles`, `book_proposals`
- Sermon builder tables: `sermon_series`, `sermons`, `sermon_assets`
- Attachments table: `attachments`
- Fitness tables (defined in migration, NOT YET APPLIED):
  - `exercises` (exercise library with global templates)
  - `workout_templates` (reusable workout structures)
  - `training_plans` (periodized training blocks)
  - `equipment` (gear tracking with mileage)
  - `workout_logs` (completed workouts)
  - `workout_sets` (individual sets in workouts)
  - `workout_metrics` (TSS, strain, readiness per workout)
  - `body_metrics` (weight, sleep, stress, HRV, RHR)
  - `blood_pressure` (BP readings with AHA classification)
  - `personal_records` (exercise PRs with weight/reps/date)
  - `athlete_profile` (zones, FTP, medication, cardiac baselines)
  - `lab_results` (lab panels with AI analysis)
  - `medical_appointments` (doctor visits)
  - `medications` (medication tracking)
  - `compliance_log` (adherence tracking)

## RLS and Ownership Model
- RLS enabled broadly across app tables.
- Core/planning modules use `user_id` ownership policies.
- Book/attachments/AI modules use `org_id` ownership policies.
- In current schema, both ownership columns reference `auth.users(id)`.

## Storage
- Buckets created by migrations:
  - `book_uploads` (private)
  - `attachments` (private)
- Storage object policies enforce first path segment equals `auth.uid()`.
- Route handlers upload/download via Supabase Storage:
  - `src/app/books/upload/route.ts`
  - `src/app/attachments/upload/route.ts`
  - `src/app/attachments/[id]/download/route.ts`

## Extensions and AI Data
- `vector` extension is enabled for `chapter_chunks.embedding vector(1536)`.
- Status fields:
  - `notes.status` defaults to `inbox`.
  - `research_notes.status` defaults to `inbox`.
- `pg_stat_statements`, `pgcrypto`, and `uuid-ossp` are enabled in baseline schema migration.
