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

## ⚠️ Multi-Project Workflow Warning

**CRITICAL**: The user works on multiple projects simultaneously. **NEVER** use broad commands that affect all running processes:

❌ **DO NOT USE**:
- `killall node` — Kills all Node processes across all projects
- `pkill -f "npm"` — Kills all npm processes
- `pkill -f "next"` — Kills all Next.js dev servers
- `supabase stop --all` — Stops all Supabase instances
- `docker stop $(docker ps -q)` — Stops all Docker containers
- Any command that targets processes globally without project-specific filtering

✅ **DO USE**:
- `lsof -ti:3001 | xargs kill` — Kill specific port only
- `npm run dev -- -p 3001` — Start on specific port
- Check specific process: `lsof -i:3001` before killing
- Project-specific Supabase commands within the project directory

**When port conflicts occur**: Ask the user which port to use or check if the existing process can be reused rather than killing everything.

## Key Conventions

- **Server components** for data fetching, **client components** (`'use client'`) for interactivity
- Client components live in `src/components/` (not co-located with pages)
- Route handlers use `src/app/[module]/[action]/route.ts` for mutations
- API routes use `src/app/api/[module]/route.ts` for JSON endpoints
- All tables use `user_id` with RLS policies (`auth.uid() = user_id`)
- Styling: Tailwind v4 only, card pattern = `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`
- Icons: Lucide React (`lucide-react`) — no emoji icons in UI
- Tap targets: minimum 44px (`min-h-[44px]`)
- Migrations: `supabase/migrations/YYYYMMDDHHmmss_name.sql`

## Database Status

✅ **All migrations applied** — Fitness module is fully operational.

Migrations applied:
- `supabase/migrations/20260225100000_fitness_module.sql` — 16 tables, RLS, indexes
- `supabase/migrations/20260225100500_seed_exercises.sql` — 52 default exercises
- `supabase/migrations/20260225120000_health_context_system.sql` — Health tracking tables
- `supabase/migrations/20260226000000_garmin_integration.sql` — Garmin sync support
- `supabase/migrations/20260227240000_add_set_completion_tracking.sql` — Set completion tracking
- `supabase/migrations/20260227250000_fasting_logs.sql` — Fasting logs table
- `supabase/migrations/20260228000000_calendar_workout_sync.sql` — Calendar workout auto-sync triggers

All fitness and calendar features are working and tested.

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
    fitness/            # 20+ fitness client components
    calendar/           # Calendar components (MonthView, WeekView, DayView, Filters, ScheduleWorkoutModal)
    Sidebar.tsx         # App navigation
  lib/
    fitness/            # 18 lib modules (TSS, PMC, readiness, strain, health-doc-updater, etc.)
    calendar/           # Calendar utilities (date-utils.ts)
    supabase/           # Supabase client helpers
    openai.ts           # OpenAI call helper
```

## Fitness Module Status

### ✅ Completed & Deployed
- Phase 1: Foundation (dashboard, logger, BP, templates, exercises, metrics)
- Phase 2: Weather integration, Garmin FIT file import, Garmin sync library
- Phase 3: TSS, PMC, compliance, AI builder, safety alerts
- Phase 4: Trends page with Recharts visualizations
- Phase 5: Training plans, PRs, equipment, plate calculator
- Phase 6: Readiness, strain, cardiac efficiency, est. 1RM, power zones, sleep debt, TDEE, recovery, morning briefing, labs, athlete profile
- Additional: Lab results dashboard with AI comprehensive analysis, template drag-and-drop editor, Garmin auth pages
- UI Modernization: Lucide React icons (replaced all emoji), solid white card style, updated Sidebar
- Dashboard Enhancement: Hero cards with SVG score ring, pill tabs, enhanced metric grid
- Health Intelligence: health.md initialized, buildAISystemPrompt() with 19 function types, medication auto-seeding
- Cardiologist Report: PDF generation with @react-pdf/renderer (2-page report with questions, vitals, meds, notes)
- Appointment Prep: AI-generated questions, changes summary, flags — full pipeline working
- FIT Parser Fixes: Corrected stress/body battery extraction, added fallback field sweep
- Column Name Resilience: medications & health-context handle both name/type and medication_name/medication_type schemas
- Health.md Auto-Updater: Trigger detection (medication_change, lab_upload, metric_shift, methylation_upload), 7 section generators, user approval workflow, version control
- Calendar Enhancement: Month/week/day views, filters, workout scheduling modal, auto-sync triggers (planned_workouts ↔ calendar_events), click-through navigation

### 🚧 In Progress / Next Steps
- Methylation report display (uploads work, need display/routing to show extracted SNPs)
- Workout log button visibility (logger fully built, needs prominent CTA on dashboard)
- Garmin OAuth full automation (manual FIT import works)
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
