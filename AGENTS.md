# AGENTS.md — Mission Control Startup Context for Codex

## Project Snapshot
- Mission Control is a personal-first Next.js app for tasks, goals, calendar, reviews, books, sermons, notes, and fitness/health tracking.
- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase (Auth/Postgres/RLS/Storage), OpenAI.

## Session Startup
1. Read this file.
2. Read docs in this order:
   - `docs/CONTEXT.md`
   - `docs/ARCHITECTURE.md`
   - `docs/API.md`
   - `docs/INTEGRATIONS.md`
   - `docs/ENVIRONMENT.md`
   - `docs/WORKFLOWS.md`
   - `docs/RUNBOOK.md`
   - `docs/DEPLOYMENT.md`
   - `docs/CONTRIBUTING.md`
   - `docs/OWNERSHIP.md`
   - `docs/RELEASES.md`
   - `docs/TASKS.md`
   - `docs/DECISIONS/*`
3. Or run preflight: `./scripts/mission-control-preflight.sh`

## Local Commands
```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
```

## Safety Rules
- This user runs multiple projects in parallel.
- Never run broad process-kill commands (`killall node`, `pkill -f "npm"`, `pkill -f "next"`, `supabase stop --all`, etc.).
- Use project/port-specific commands only (example: `lsof -ti:3001 | xargs kill`).

## Codebase Conventions
- Prefer server components for fetching; use client components only where interactivity is needed.
- Client components belong in `src/components/` (not page co-location by default).
- API routes: `src/app/api/[module]/route.ts`.
- Mutation handlers: `src/app/[module]/[action]/route.ts`.
- Supabase tables should use `user_id` with RLS policy `auth.uid() = user_id`.
- Tailwind card baseline: `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`.
- Use Lucide icons (`lucide-react`) and minimum 44px tap targets.
- Migrations format: `supabase/migrations/YYYYMMDDHHmmss_name.sql`.

## Connected Services
- GitHub repo: `EricCJaffe/Mission-Control`
- Vercel project: `mission-control` (`prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`)
- Supabase project ref: `npxirjaawlpubrtjovpy`

## Environment
Required env vars (in `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPT_KEY`

Optional feature flags:
- `OPENAI_MODEL`
- `OPENWEATHER_API_KEY`
- `ADMIN_EMAIL`
- `GARMIN_EMAIL`
- `GARMIN_PASSWORD`

## Documentation Hygiene
When code changes, update docs:
- Architecture decisions -> `docs/DECISIONS/`
- Active work -> `docs/TASKS.md`
- Integrations -> `docs/INTEGRATIONS.md`
- Env vars -> `docs/ENVIRONMENT.md`
- Workflow/deploy changes -> `docs/WORKFLOWS.md` and/or `docs/DEPLOYMENT.md`
- Release notes -> `docs/RELEASES.md`
- Session summary -> `docs/SESSION-CHANGELOG.md`

## Current Priorities / Known Gaps
- PDF viewer UX for lab dashboard (signed URL flow).
- Two calendar timezone migrations still local-only.
- Garmin OAuth not implemented yet (CSV import works).
- AI training plan generation planned.

## Source of Truth
- This file is derived from `CLAUDE.md`.
- If `CLAUDE.md` and this file diverge, update both to keep context consistent across agents.
