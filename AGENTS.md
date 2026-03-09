# AGENTS.md — Mission Control Startup Context for Codex

## Project Snapshot
- Mission Control is a personal-first Next.js app for planning, notes, reviews, writing, and a large fitness/health system.
- Stack: Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, OpenAI, Vercel.

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
   - `docs/SESSION-CHANGELOG.md`
   - `docs/DECISIONS/*`
3. Or run preflight: `./scripts/mission-control-preflight.sh`

## Local Commands
```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

## Safety Rules
- The user runs multiple projects in parallel.
- Never run broad process-kill commands.
- Use project-specific ports or PIDs only.
- Do not commit `.claude/`.

## Codebase Conventions
- Prefer server components for data fetching; use client components only where interactivity is needed.
- Client components belong in `src/components/`.
- API routes: `src/app/api/[module]/route.ts`.
- Mutation handlers: `src/app/[module]/[action]/route.ts`.
- Supabase tables should use `user_id` with RLS policy `auth.uid() = user_id`.
- Tailwind card baseline: `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`.
- Use Lucide icons and minimum 44px tap targets.
- Migrations format: `supabase/migrations/YYYYMMDDHHmmss_name.sql`.

## Connected Services
- GitHub repo: `EricCJaffe/Mission-Control`
- Vercel project: `mission-control` (`prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`)
- Supabase project ref: `npxirjaawlpubrtjovpy`

## Environment
Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPT_KEY`

Optional:
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `OPENWEATHER_API_KEY`
- `ADMIN_EMAIL`
- `GARMIN_EMAIL`
- `GARMIN_PASSWORD`

## Documentation Hygiene
When code changes, update:
- `docs/TASKS.md` for active work
- `docs/RELEASES.md` for shipped changes
- `docs/SESSION-CHANGELOG.md` for session-level notes
- `docs/INTEGRATIONS.md` for external service changes
- `docs/ENVIRONMENT.md` for env var changes
- `docs/WORKFLOWS.md` and `docs/DEPLOYMENT.md` for runtime or deploy changes
- `CLAUDE.md` and `AGENTS.md` together if startup guidance changes

## Current Priorities / Known Gaps
- Garmin OAuth is still not implemented.
- Email notifications for pending `health.md` updates are still not implemented.
- `.claude/` remains local-only.

## Current Shipped Health/Fitness Scope
- Genetics multi-report analysis with comprehensive synthesis
- Imaging ingestion and analysis
- Health command center with persisted synthesis and PDF export
- 12-week training plan generation, detail views, PDF export, and scheduling bridge
- Hydration, nutrition, and recovery modules with AI insights
- Morning briefing integrates health context, hydration, nutrition, recovery, scripture, quote, and daily learning

## Source of Truth
- Keep this file aligned with `CLAUDE.md`.
