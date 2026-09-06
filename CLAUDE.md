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
- Tailwind card baseline: `rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm`
- Lucide icons only
- Migrations use `supabase/migrations/YYYYMMDDHHmmss_name.sql`

## Remote Services
- GitHub: `EricCJaffe/Mission-Control`
- Vercel: `mission-control` (`prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`)
- Supabase: `uivawtdmxqutqelwibra` (shared with FinanceOS and BibleOS), schema **`mission`**
  - Every Supabase client MUST pass `db: { schema: DB_SCHEMA }` from `src/lib/supabase/schema.ts`.
    Omitting it falls back to `public`, which is FinanceOS — and `tasks` exists in both,
    so the query succeeds and returns the wrong rows.
  - Old project `npxirjaawlpubrtjovpy` is retained as the rollback and is no longer read or written.

## Cross-project sync (added 2026-09-05)

Mission Control reads every task list under `~/dev` and files the results
against the priority matrix. Read `docs/runbook.md` before touching it.

- **`scripts/sync/`** is a Node CLI, not part of the Next build. It runs on
  Node 24's native TypeScript — no `tsx`, no test runner, no new dependencies.
  `scripts/sync/package.json` scopes ESM to that directory; do not add
  `"type": "module"` to the root package.json.
  `npm run sync:projects -- --dry-run`, `npm run test:sync`,
  `npm run typecheck:sync` (the root tsconfig excludes `scripts/`, deliberately).
- **It is read-only against every other repo.** It runs `git config` and reads
  files. Nothing in it may ever write outside this app's own database — closing
  a task happens in the project, and the next run notices.
- **`edited_at` is the contract.** `/tasks/update` stamps it on every write.
  While it is null the source file owns a task's title, status and priority;
  once set, the sync may only refresh wording. Do not remove that stamp.
- **The five domains** are `spirit | body | soul | family | work`, carrying
  God First → Health → Family → Impact. Null is legal and means unclassified —
  never default an unknown to `work` to make a count tidy.
- **Where the sync surfaces.** `/tasks` filters by domain, project and source;
  `/projects` shows each repo's rollup — what was imported against what the
  repo actually holds, so a project with three tracked tasks and six hundred
  real ones cannot look finished; `/brief` is this week as a page; `/briefs` is
  the email history; `/sync` says whether any of it is current.
- **Migrations: `supabase db push` does not work from this repo and cannot.**
  The database is shared with FinanceOS, so the migration ledger is shared too
  and most of its rows have no file here. Apply through `apply_migration` and
  commit the file in the same breath. Read `supabase/README.md` — especially the
  part about never running the `migration repair --status reverted` the CLI
  suggests.

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

## Current Status (August 6, 2026)
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

### Recently shipped (Aug 3-6)
- Fitness restructured to five sections: Today / Train / Body / Health / Recovery
- Prayer module seeded from Eric's 2025 journal — rotation, scheduling, history
- Reading-plan pace, streaks, day grid and Catch Me Up
- Mileage page with sport switcher, named date ranges and charts
- Personal records show current capability with all-time bests alongside
- Heart-rate zones on cardio workouts; recovery trends
- Reviews retired — Flourishing is the periodic self-review

### Conventions worth knowing before editing UI
- Blue is every primary action; green means DONE and nothing else
- Use `src/lib/day.ts` for "today" — never `toISOString().slice(0,10)`, the
  server runs in UTC and that breaks every evening east of UTC-0
- Missing inputs drop out of derived scores rather than being given a value;
  anything estimated says so on screen

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
