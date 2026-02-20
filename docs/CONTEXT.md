# Project Context

## Purpose
TacPastor’s Mission Control is a personal-first system for projects, tasks, and markdown knowledge. It centers on Spirit/Soul/Body alignment and supports knowledge export to a local vault.

## Tech Stack
- Next.js 16 App Router (React 19)
- Tailwind CSS v4
- Supabase (Auth + Postgres) via @supabase/ssr and @supabase/supabase-js
- TypeScript

## Key Entry Points
- `src/app/layout.tsx` (global layout + navigation)
- `src/app/page.tsx` (home)
- `middleware.ts` (route protection)
- `src/lib/supabase/server.ts` (server client)
- `src/lib/supabase/client.ts` (browser client)

## Routing Structure
- Public routes:
  - `/` home
  - `/login`
  - `/health`
- Auth routes:
  - `/auth/callback` (code exchange)
  - `/auth/signout` (POST)
- App routes (protected by middleware):
  - `/dashboard`
  - `/projects`
  - `/tasks`
  - `/notes`
  - `/notes/[id]`
  - `/knowledge`
- API routes:
  - `/api/ai`

## Auth and Membership
- Auth lives in Supabase Auth with email/password.
- Session handling is via @supabase/ssr and cookies.
- Data isolation is per-user using `user_id` with RLS in Supabase.

## Module Flags
- `ADMIN_EMAIL` gates the Knowledge export button if set.
- `OPENAI_API_KEY` enables the server-only AI endpoint; otherwise it returns a stub response.

## Testing
- Test runner: Not present in repo.
- Smoke tests: `npm run dev` and page-by-page manual checks.

## Planned Feature Sets
- Home dashboard with Priority Matrix, Today view, Alignment banner.
- Tasks v2: categories, recurrence, "why" alignment field.
- Calendar module with recurring events and linkable items.
- Monthly Review + Survey + scoring + archive.
- Metrics dashboard (minimal, non-vanity).
