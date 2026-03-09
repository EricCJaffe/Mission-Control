# Mission Control

Mission Control is a personal operating system built with Next.js, Supabase, and OpenAI. It combines planning, notes, calendar, books, sermons, and a deep fitness and health stack in one app.

## Stack
- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth, Postgres, RLS, Storage
- OpenAI for writing and health/performance insights
- Vercel for deployment

## Core Modules
- Dashboard, tasks, goals, reviews, calendar, notes
- Book writer and sermon builder
- Fitness dashboard, workout logger, templates, plans, history, PRs, equipment
- Health intelligence: `health.md`, labs, genetics, imaging, medications, appointments, morning briefing
- Recovery, hydration, nutrition, readiness, command-center analysis, and Withings sync

## Current Status
- `main` is the active branch
- Vercel project linked: `mission-control`
- Supabase project linked: `npxirjaawlpubrtjovpy`
- Production build is currently passing
- Major fitness/health workflows are live, including Withings API sync, genetics multi-report analysis, command center, training plans, hydration, nutrition, and recovery tracking

## Local Setup
```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment
Create `.env.local` with:
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

## Documentation
Start with:
- `AGENTS.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/TASKS.md`
- `docs/RELEASES.md`
- `docs/SESSION-CHANGELOG.md`

## Deployment
- Local production check: `npm run build`
- Vercel is the primary deploy target
- Pull envs locally with `vercel env pull .env.local`

## Remaining Open Backlog
- Garmin OAuth automation
- Email notifications for pending `health.md` updates
- Withings webhook subscriptions
