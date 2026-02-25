# CLAUDE.md — Project Context for Claude Code

## Project Overview

Mission Control is a personal-first Next.js app for tasks, goals, reviews, calendar, book writing, sermon building, and **fitness tracking** with cardiac-awareness. Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase (Auth + Postgres + RLS + Storage), and OpenAI.

## Quick Start

```bash
npm install
npm run dev        # starts on localhost:3000
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript check (no test suite configured)
```

## Key Conventions

- **Server components** for data fetching, **client components** (`'use client'`) for interactivity
- Client components live in `src/components/` (not co-located with pages)
- Route handlers use `src/app/[module]/[action]/route.ts` for mutations
- API routes use `src/app/api/[module]/route.ts` for JSON endpoints
- All tables use `user_id` with RLS policies (`auth.uid() = user_id`)
- Styling: Tailwind v4 only, card pattern = `rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm`
- Tap targets: minimum 44px (`min-h-[44px]`)
- Migrations: `supabase/migrations/YYYYMMDDHHmmss_name.sql`

## Critical: Database Migration NOT YET APPLIED

The fitness module migration has been written but **not applied to the database**:

```bash
supabase db push   # Run this to apply all pending migrations
```

Files:
- `supabase/migrations/20260225100000_fitness_module.sql` — 16 tables, RLS, indexes
- `supabase/migrations/20260225100500_seed_exercises.sql` — 52 default exercises

Until this runs, all fitness features will fail with database errors.

## Project Structure

```
src/
  app/
    dashboard/          # Home dashboard
    tasks/              # Task management
    calendar/           # Calendar module
    goals/              # Goals & cycles
    reviews/            # Monthly/quarterly/annual reviews
    books/              # Book writer
    sermons/            # Sermon builder
    notes/              # Notes & knowledge
    fitness/            # Fitness module (16 pages)
      page.tsx          # Dashboard
      log/              # Workout logger
      exercises/        # Exercise library + seed endpoint
      templates/        # Workout templates
      plans/            # Training plans
      bp/               # Blood pressure
      metrics/          # Body metrics
      trends/           # Trends & analytics
      equipment/        # Equipment tracker
      records/          # Personal records
      history/          # Workout history
      morning/          # Morning briefing
      labs/             # Lab results
      settings/         # Athlete profile
      appointments/     # Medical appointments
      medications/      # Medication tracking
    api/
      ai/               # AI routes (book, general)
      fitness/          # 18+ fitness API routes
  components/
    fitness/            # 18 fitness client components
    Sidebar.tsx         # App navigation
  lib/
    fitness/            # 16 lib modules (TSS, PMC, readiness, strain, etc.)
    supabase/           # Supabase client helpers
    openai.ts           # OpenAI call helper
```

## Fitness Module Status

### Done (code complete)
- Phase 1: Foundation (dashboard, logger, BP, templates, exercises, metrics) ✅
- Phase 2: Weather integration ✅, Garmin sync lib ✅
- Phase 3: TSS, PMC, compliance, AI builder, safety alerts ✅
- Phase 4: Trends page ✅
- Phase 5: Training plans, PRs, equipment, plate calculator ✅
- Phase 6: Readiness, strain, cardiac efficiency, est. 1RM, power zones, sleep debt, TDEE, recovery, morning briefing, labs, athlete profile ✅

### Not Yet Done
- **Apply database migration** (blocker for everything)
- Garmin OAuth client (needs credentials + npm package)
- PDF export framework (needs `@react-pdf/renderer`)
- Cardiologist report PDF
- Recharts integration for trend charts
- AI plan generation (auto-generate plans from historical data)

## Environment Variables Needed

```env
# Already configured
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...

# Needed for fitness features
OPENWEATHER_API_KEY=...        # Weather integration
GARMIN_EMAIL=...               # Garmin sync (when built)
GARMIN_PASSWORD=...            # Garmin sync (when built)
```

## Documentation

- `docs/plan.md` — Detailed fitness implementation plan with per-step status
- `docs/TASKS.md` — Current task list with what's done and pending
- `docs/BACKLOG.md` — Full module mapping
- `docs/CONTEXT.md` — Project context, routing structure, conventions
- `docs/RELEASES.md` — Change log
- `docs/ARCHITECTURE.md` — Architecture overview
- `docs/DECISIONS/` — Architectural decision records
