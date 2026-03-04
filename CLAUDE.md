# CLAUDE.md

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Auth + Postgres + RLS + Storage), OpenAI. Personal app — single user with RLS (`auth.uid() = user_id`).

## Commands

```bash
npm run dev          # localhost:3000
npm run lint         # ESLint
npx tsc --noEmit     # type check (must pass — Vercel rejects build failures)
```

## Project-Specific Rules

- Client components in `src/components/` (not co-located with pages)
- Mutations: `src/app/[module]/[action]/route.ts` — JSON APIs: `src/app/api/[module]/route.ts`
- Styling: Tailwind v4 only. Card = `rounded-2xl border border-slate-100 bg-white p-5 shadow-sm`
- Icons: `lucide-react` only — no emoji in UI
- Tap targets: min 44px (`min-h-[44px]`)
- Migrations: `supabase/migrations/YYYYMMDDHHmmss_name.sql`
- `callOpenAI` uses Responses API: `({ model, system, user }) => string`. NOT Chat Completions — no `messages` array, no `response.choices`.
- DB `exercises.category` CHECK constraint requires lowercase: `push|pull|legs|core|cardio|mobility`

## CRITICAL: Multi-Project Safety

User runs multiple projects simultaneously. **NEVER** broad-kill processes:
- Banned: `killall node` / `pkill -f "npm"` / `pkill -f "next"` / `supabase stop --all` / `docker stop $(docker ps -q)`
- Use: `lsof -ti:3001 | xargs kill` (specific port). Ask user which port if conflicts.

## Remote Services

| Service | ID |
|---|---|
| GitHub | `EricCJaffe/Mission-Control` |
| Vercel | `prj_jQyhulWy1MqJP6FzNBu2MzP65Bo4`, team `team_mVKn9BOkHHbryfcVkok963Br` |
| Supabase | `npxirjaawlpubrtjovpy` (us-west-2) |

## Database

2 migrations local-only (not pushed to remote):
- `20260228200000_fix_planned_workout_calendar_timezone.sql`
- `20260228201000_repair_planned_workout_calendar_events.sql`

Check sync: `supabase migration list`. Apply: `supabase db push`.

## Docs (read as needed, not upfront)

| When you need... | Read |
|---|---|
| Routing, auth, module flags | `docs/CONTEXT.md` |
| Runtime shape, data access, security | `docs/ARCHITECTURE.md` |
| Route handler reference | `docs/API.md` |
| External APIs (Supabase, OpenAI, Garmin, Withings) | `docs/INTEGRATIONS.md` |
| Env vars | `docs/ENVIRONMENT.md` |
| Dev/build/deploy workflows | `docs/WORKFLOWS.md` |
| Troubleshooting | `docs/RUNBOOK.md` |
| Current tasks & priorities | `docs/TASKS.md` |
| Architecture decisions | `docs/DECISIONS/*` |

## Doc Maintenance

| Change | Update |
|---|---|
| Major decision | ADR in `docs/DECISIONS/` |
| Feature started/completed | `docs/TASKS.md` |
| Integration/env var added | `docs/INTEGRATIONS.md` / `docs/ENVIRONMENT.md` |
| Deployment/workflow change | `docs/WORKFLOWS.md` |
| Session summary | `docs/SESSION-CHANGELOG.md` |

## Known Issues

- Garmin OAuth not implemented (CSV/FIT import works)
- Email notifications blocked on Resend integration
