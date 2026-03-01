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

## Session Preflight

Before doing work, read the docs in this order (or run `./scripts/mission-control-preflight.sh`):

1. **This file** — conventions, structure, status
2. `docs/CONTEXT.md` — routing, auth, module flags, key entry points
3. `docs/ARCHITECTURE.md` — runtime shape, data access, AI architecture, security model
4. `docs/API.md` — all route handlers (JSON, file, mutation)
5. `docs/INTEGRATIONS.md` — external APIs (Supabase, OpenAI, OpenWeather, Garmin, Withings)
6. `docs/ENVIRONMENT.md` — env vars (required, optional, secrets)
7. `docs/WORKFLOWS.md` — dev, build, deploy, Supabase schema, calendar sync
8. `docs/RUNBOOK.md` — troubleshooting (env, storage, fitness DB, migrations, OpenAI, calendar, Turbopack)
9. `docs/DEPLOYMENT.md` — build, hosting, runtime constraints, rollback
10. `docs/CONTRIBUTING.md` — local setup, code style
11. `docs/OWNERSHIP.md` — maintainer (Eric Jaffe)
12. `docs/RELEASES.md` — rolling changelog
13. `docs/TASKS.md` — current tasks, critical path, priorities
14. `docs/DECISIONS/*` — architectural decision records (ADRs)

## Keeping Docs Up To Date

When making changes, update the relevant docs:

| Change Type | Update |
|---|---|
| Major decision | Add an ADR in `docs/DECISIONS/` |
| New feature started | Add/adjust tasks in `docs/TASKS.md` |
| Integration added | Update `docs/INTEGRATIONS.md` |
| Env var added | Update `docs/ENVIRONMENT.md` |
| Deployment/workflow change | Update `docs/WORKFLOWS.md` |
| Release notes needed | Update `docs/RELEASES.md` |
| Session summary | Append to `docs/SESSION-CHANGELOG.md` |

## Multi-Project Workflow Warning

**CRITICAL**: The user works on multiple projects simultaneously. **NEVER** use broad commands that affect all running processes:

- `killall node` / `pkill -f "npm"` / `pkill -f "next"` / `supabase stop --all` / `docker stop $(docker ps -q)`

**DO USE**: `lsof -ti:3001 | xargs kill` (kill specific port), project-specific Supabase commands. Ask the user which port if conflicts occur.

## Key Conventions

- **Server components** for data fetching, **client components** (`'use client'`) for interactivity
- Client components live in `src/components/` (not co-located with pages)
- Route handlers: `src/app/[module]/[action]/route.ts` for mutations
- API routes: `src/app/api/[module]/route.ts` for JSON endpoints
- All tables use `user_id` with RLS policies (`auth.uid() = user_id`)
- Styling: Tailwind v4 only, card pattern = `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`
- Icons: Lucide React (`lucide-react`) — no emoji icons in UI
- Tap targets: minimum 44px (`min-h-[44px]`)
- Migrations: `supabase/migrations/YYYYMMDDHHmmss_name.sql`

## Remote Services

| Service | Identifier | CLI Auth |
|---|---|---|
| GitHub | `EricCJaffe/Mission-Control` | `gh` (authenticated) |
| Vercel | Project `mission-control` (`prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`, team `team_mVKn9BOkHHbryfcVkok963Br`) | `vercel` (authenticated as ericcjaffe) |
| Supabase | Project `npxirjaawlpubrtjovpy` (EricCJaffe's Project, us-west-2) | `supabase` (linked) |

## Database Status

All migrations applied to remote Supabase except two local-only calendar timezone fixes:
- `20260228200000_fix_planned_workout_calendar_timezone.sql` — local only
- `20260228201000_repair_planned_workout_calendar_events.sql` — local only

Key migrations (all applied):
- `20260225100000` — Fitness module (16 tables, RLS, indexes)
- `20260225100500` — Seed 52 default exercises
- `20260225120000` — Health context system
- `20260226000000` — Garmin integration
- `20260227250000` — Fasting logs
- `20260228000000` — Calendar workout sync triggers
- `20260228300000` — Withings import schema
- `20260228999999` — insert_genetic_markers RPC function

Run `supabase migration list` to check sync status. Apply with `supabase db push`.

## Project Structure

```
src/
  app/
    dashboard/          # Home dashboard
    tasks/              # Task management
    calendar/           # Calendar module (month/week/day views)
    goals/              # Goals & cycles
    reviews/            # Monthly/quarterly/annual reviews
    books/              # Book writer
    sermons/            # Sermon builder
    notes/              # Notes & knowledge
    fitness/            # Fitness module (20+ pages)
      page.tsx          # Dashboard
      log/              # Workout logger
      exercises/        # Exercise library + seed endpoint
      templates/        # Workout templates
      plans/            # Training plans
      bp/               # Blood pressure
      metrics/          # Body metrics + HRV + RHR sub-pages
      trends/           # Trends & analytics
      equipment/        # Equipment tracker
      records/          # Personal records
      history/          # Workout history + detail view
      morning/          # Morning briefing
      labs/             # Lab results
      settings/         # Athlete profile + Garmin/Withings import
      appointments/     # Medical appointments
      medications/      # Medication tracking
      fasting/          # Fasting tracker
      genetics/         # Methylation/genetics
      sleep/            # Sleep dashboard
      health/           # Health doc view + review-updates
    api/
      ai/               # AI routes (book, general)
      fitness/          # 25+ fitness API routes
      cron/             # Daily metric check
  components/
    fitness/            # 30+ fitness client components
    calendar/           # Calendar components (MonthView, WeekView, DayView, Filters, modals)
    Sidebar.tsx         # App navigation
    RichTextEditor.tsx  # Tiptap editor
  lib/
    fitness/            # 20 lib modules (TSS, PMC, readiness, strain, health-doc-updater, etc.)
    calendar/           # Calendar utilities (date-utils.ts)
    supabase/           # Supabase client helpers
    openai.ts           # OpenAI call helper
docs/                   # Project documentation (see Session Preflight above)
scripts/                # Utility scripts (preflight, migration, data fixes)
supabase/migrations/    # 30 database migrations
```

## Environment Variables

```env
# Required (already configured in .env.local)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
ENCRYPT_KEY=...

# Optional / feature-dependent
OPENAI_MODEL=...               # Defaults: gpt-5.2 (books/sermons), gpt-4o-mini (fitness)
OPENWEATHER_API_KEY=...        # Weather integration
ADMIN_EMAIL=...                # Knowledge export gate
GARMIN_EMAIL=...               # Garmin sync (when built)
GARMIN_PASSWORD=...            # Garmin sync (when built)
```

## Current Status (as of March 1, 2026)

### Completed
- Full fitness module (workout logger, dashboard, exercises, templates, plans, BP, metrics, equipment, PRs, history)
- Health intelligence (health.md, AI prompts, medications, labs, appointments, cardiologist PDF report)
- Health.md auto-updater (triggers, section generators, user approval, version control)
- Calendar enhancement (month/week/day views, filters, workout scheduling, auto-sync triggers)
- Data imports (Garmin CSV, Withings CSV, FIT file parser)
- Metric dashboards (RHR, HRV, sleep, weight with AI insights)
- UI modernization (Lucide icons, solid white cards, colorful sidebar)

### In Progress / Known Issues
- Methylation report: DB insert blocked by PostgREST schema cache (see `docs/METHYLATION_BUG.md`)
- 2 calendar timezone migrations not yet pushed to remote
- Garmin OAuth not implemented (CSV import works)
- AI training plan generation (planned, not started)

### Critical Path
- March 13, 2026: Dr. Chandler cardiologist appointment (prep pipeline complete)
