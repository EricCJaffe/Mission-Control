# Project Context

## Purpose
TacPastor’s Mission Control is a personal-first system for projects, tasks, goals, reviews, SOPs, calendar planning, book-writing workflows, fitness tracking, and markdown knowledge management. It centers on Spirit/Soul/Body alignment and supports export/import with a local `vault/`.

## Tech Stack
- Next.js 16 App Router (React 19)
- TypeScript
- Tailwind CSS v4
- Supabase (Auth, Postgres, Storage, RLS) via `@supabase/ssr` and `@supabase/supabase-js`
- Tiptap editor (`@tiptap/*`)
- OpenAI Responses API via server route handlers (`src/lib/openai.ts`)

## Key Entry Points
- `src/app/layout.tsx` (global layout + app shell)
- `src/app/page.tsx` (home; redirects to `/login` when logged out)
- `middleware.ts` (auth protection + login redirect behavior)
- `src/lib/supabase/server.ts` (server Supabase client)
- `src/lib/supabase/client.ts` (browser Supabase client)
- `src/lib/openai.ts` (server OpenAI call helper)

## Routing Structure
- Public routes:
  - `/` (redirects to `/login` when logged out)
  - `/login`
  - `/reset-password`
  - `/health`
- Auth routes:
  - `/auth/callback` (code exchange)
  - `/auth/signout` (POST)
- Protected app routes (enforced in `middleware.ts`):
  - `/dashboard`
  - `/projects`
  - `/tasks`
  - `/calendar`
  - `/goals`
  - `/reviews`
  - `/books`
  - `/notes`
  - `/knowledge`
  - `/sops`
  - `/sermons`
  - `/fitness` (and all sub-routes below)
- Fitness routes (`/fitness/*`):
  - `/fitness` — Main fitness dashboard (readiness, strain, alerts, quick links)
  - `/fitness/log` — Workout logger (strength/cardio/hybrid)
  - `/fitness/exercises` — Exercise library browser/editor + seed endpoint
  - `/fitness/templates` — Workout template manager
  - `/fitness/plans` — Training plan creation and management
  - `/fitness/bp` — Blood pressure dashboard with entry + trends
  - `/fitness/metrics` — Body metrics entry (weight, sleep, stress)
  - `/fitness/trends` — Trends & analytics
  - `/fitness/equipment` — Equipment tracker (shoes, bikes, etc.)
  - `/fitness/records` — Personal records
  - `/fitness/history` — Workout history with repeat feature
  - `/fitness/morning` — Morning briefing (AI readiness + recommendations)
  - `/fitness/labs` — Lab results with AI analysis
  - `/fitness/settings` — Athlete profile (zones, FTP, meds, baselines)
  - `/fitness/appointments` — Medical appointments
  - `/fitness/medications` — Medication tracking
- Fitness API routes (`/api/fitness/*`):
  - `/api/fitness/workouts` — Workout CRUD
  - `/api/fitness/exercises` — Exercise CRUD
  - `/api/fitness/templates` — Template CRUD
  - `/api/fitness/plans` — Training plan CRUD
  - `/api/fitness/bp` — Blood pressure CRUD
  - `/api/fitness/equipment` — Equipment CRUD
  - `/api/fitness/records` — Personal records
  - `/api/fitness/trends` — Trend data queries
  - `/api/fitness/readiness` — Readiness score calculation
  - `/api/fitness/strain` — Strain score calculation
  - `/api/fitness/pmc` — PMC (CTL/ATL/TSB) calculation
  - `/api/fitness/weather` — Weather data
  - `/api/fitness/calendar` — iCal export
  - `/api/fitness/morning-briefing` — AI morning briefing
  - `/api/fitness/athlete-profile` — Athlete settings
  - `/api/fitness/labs` — Lab results + AI analysis
  - `/api/fitness/appointments` — Appointments CRUD
  - `/api/fitness/medications` — Medications CRUD
  - `/api/fitness/ai/*` — AI workout builder, insights, summaries
- AI/API routes:
  - `/api/ai`
  - `/api/ai/chat`
  - `/api/ai/outline`
  - `/api/ai/patch`
  - `/api/ai/retrieve`
- Sermon AI routes:
  - `/sermons/ai/outline-series` — Generate sermon outlines for a series
  - `/sermons/ai/series-to-book` — Convert sermon series to book format
  - `/sermons/ai/book-to-series` — Convert book to sermon series
  - `/sermons/ai/generate-assets` — Generate sermon assets (graphics, slides, etc.)

## Auth and Membership
- Auth is Supabase Auth (email/password, callback exchange, signout route).
- Sessions are cookie-based using `@supabase/ssr` clients in middleware and server components.
- Data isolation is per authenticated user, with RLS policies on app tables.
- Ownership columns use both styles:
  - Core/tasking tables use `user_id`.
  - Book/attachments/AI tables use `org_id` (mapped to `auth.users.id` in current schema).

## Key Entry Points (Fitness)
- `src/app/fitness/page.tsx` — Dashboard server component
- `src/components/fitness/WorkoutLoggerClient.tsx` — Core workout logging UI (largest client component)
- `src/components/fitness/FitnessDashboardClient.tsx` — Dashboard client component
- `src/lib/fitness/types.ts` — All fitness type definitions
- `src/lib/fitness/ai.ts` — AI service layer for fitness
- `src/lib/fitness/tss.ts` — TSS calculation engine
- `src/lib/fitness/pmc.ts` — PMC (CTL/ATL/TSB) calculator
- `src/lib/fitness/readiness.ts` — Composite readiness score
- `src/lib/fitness/strain.ts` — Daily strain scoring
- `supabase/migrations/20260225100000_fitness_module.sql` — Database schema (NOT YET APPLIED)

## Module Flags
- `ADMIN_EMAIL` gates Knowledge export UI action to a single email when set (`src/app/knowledge/page.tsx`).
- `OPENAI_API_KEY` enables server AI calls; `/api/ai` still returns a scaffold response while book AI routes call OpenAI directly.
- `OPENAI_MODEL` optionally selects model name (defaults to `gpt-5.2` in current book AI routes).
- `OPENWEATHER_API_KEY` enables weather integration for fitness outdoor workouts (not yet set).

## Testing
- Test runner: not configured in `package.json`.
- Lint: `npm run lint`.
- Current validation pattern implied by repo: local `dev`/manual smoke checks.

## Implemented Feature Sets
- Home dashboard with Priority Matrix, Today view, Alignment banner.
- Tasks v2: categories, recurrence, "why" alignment field.
- Calendar module with recurring events and linkable items.
- Monthly Review + Survey + scoring + archive.
- Metrics dashboard (minimal, non-vanity).
- Book Writer with AI artifact generation.
- Sermon Builder with series editor and AI conversions.
- Fitness Module (code complete — see `docs/plan.md` for detailed status).

## Pending Feature Sets
- Apply fitness database migration (`supabase db push`).
- Garmin OAuth integration for live device sync.
- PDF export framework (weekly summary, cardiologist report).
- AI monthly review summarizer.
