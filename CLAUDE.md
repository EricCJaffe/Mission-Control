# CLAUDE.md — Project Context for Claude Code

## Project Overview
Mission Control is a personal-first Next.js app for tasks, goals, reviews, calendar, notes, books, sermons, and a large fitness/health operating system. It is built with Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, OpenAI, and Vercel.

## Quick Start
```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

## Session Preflight
Read in this order, or run `./scripts/mission-control-preflight.sh`:
1. `CLAUDE.md`
2. `docs/CONTEXT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/API.md`
5. `docs/INTEGRATIONS.md`
6. `docs/ENVIRONMENT.md`
7. `docs/WORKFLOWS.md`
8. `docs/RUNBOOK.md`
9. `docs/DEPLOYMENT.md`
10. `docs/CONTRIBUTING.md`
11. `docs/OWNERSHIP.md`
12. `docs/RELEASES.md`
13. `docs/TASKS.md`
14. `docs/SESSION-CHANGELOG.md`
15. `docs/DECISIONS/*`

## Multi-Project Workflow Warning
The user runs multiple projects at once. Never use broad kill commands like `killall node`, `pkill -f next`, or `supabase stop --all`. Use project-specific ports and processes only.

## Key Conventions
- Server components for fetching, client components for interactivity
- Client components in `src/components/`
- API routes in `src/app/api/*`
- Mutations in `src/app/*/route.ts`
- Supabase tables use `user_id` with RLS
- Tailwind card baseline: `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`
- Lucide icons only
- Migrations use `supabase/migrations/YYYYMMDDHHmmss_name.sql`

## Remote Services
- GitHub: `EricCJaffe/Mission-Control`
- Vercel: `mission-control` (`prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`)
- Supabase: `npxirjaawlpubrtjovpy`

## Environment Variables
Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPT_KEY`
- `WITHINGS_CLIENT_ID`
- `WITHINGS_CLIENT_SECRET`
- `WITHINGS_CALLBACK_URL`

Optional:
- `WITHINGS_API_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `OPENWEATHER_API_KEY`
- `ADMIN_EMAIL`
- `GARMIN_EMAIL`
- `GARMIN_PASSWORD`
- `APPLE_HEALTH_API_KEY`

## Current Status (March 10, 2026)
### Shipped
- Full fitness module: logging, templates, plans, metrics, PRs, trends, equipment, history
- Flourishing module with review-centered assessments, current profile, historical trends, AI coaching, and persona proposal review/apply flow
- Health intelligence: `health.md`, meds, labs, appointments, cardiologist prep/report, imaging
- Health.md approval/update workflow with versioning and review
- Genetics multi-report dashboard with six report types and comprehensive synthesis
- PDF viewing for labs/genetics source reports
- Health command center with persisted analysis and PDF export
- Training plan system with AI intake, detail view, PDF export, progress tracking, and scheduling bridge
- Hydration, nutrition, and recovery modules with AI-driven insights
- Withings OAuth/manual sync for health metrics with legacy CSV fallback
- Morning briefing with hydration, nutrition, recovery, scripture, fitness quote, and daily learning
- Notes schema cleanup, Turbopack root pinning, broad doc hygiene

### Open
- Garmin OAuth full automation
- Email notifications for pending `health.md` updates
- Withings webhook subscriptions

## Documentation Hygiene
When changes ship, update:
- `docs/TASKS.md`
- `docs/RELEASES.md`
- `docs/SESSION-CHANGELOG.md`
- `docs/INTEGRATIONS.md`
- `docs/ENVIRONMENT.md`
- `docs/WORKFLOWS.md` / `docs/DEPLOYMENT.md` as needed
- `AGENTS.md` when startup context changes
