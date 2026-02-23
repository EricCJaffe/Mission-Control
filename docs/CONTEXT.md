# Project Context

## Purpose
TacPastor’s Mission Control is a personal-first system for projects, tasks, goals, reviews, SOPs, calendar planning, book-writing workflows, and markdown knowledge management. It centers on Spirit/Soul/Body alignment and supports export/import with a local `vault/`.

## Tech Stack
- Next.js 16 App Router (React 19)
- TypeScript
- Tailwind CSS v4
- Supabase (Auth, Postgres, Storage, RLS) via `@supabase/ssr` and `@supabase/supabase-js`
- Tiptap editor (`@tiptap/*`)
- OpenAI Responses API via server route handlers (`src/lib/openai.ts`)

## Key Entry Points
- `src/app/layout.tsx` (global layout + app shell)
- `src/app/page.tsx` (home; redirects to `/login` when logged out)
- `middleware.ts` (auth protection + login redirect behavior)
- `src/lib/supabase/server.ts` (server Supabase client)
- `src/lib/supabase/client.ts` (browser Supabase client)
- `src/lib/openai.ts` (server OpenAI call helper)

## Routing Structure
- Public routes:
  - `/` (redirects to `/login` when logged out)
  - `/login`
  - `/reset-password`
  - `/health`
- Auth routes:
  - `/auth/callback` (code exchange)
  - `/auth/signout` (POST)
- Protected app routes (enforced in `middleware.ts`):
  - `/dashboard`
  - `/projects`
  - `/tasks`
  - `/calendar`
  - `/goals`
  - `/reviews`
  - `/books`
  - `/notes`
  - `/knowledge`
  - `/sops`
- AI/API routes:
  - `/api/ai`
  - `/api/ai/chat`
  - `/api/ai/outline`
  - `/api/ai/patch`
  - `/api/ai/retrieve`

## Auth and Membership
- Auth is Supabase Auth (email/password, callback exchange, signout route).
- Sessions are cookie-based using `@supabase/ssr` clients in middleware and server components.
- Data isolation is per authenticated user, with RLS policies on app tables.
- Ownership columns use both styles:
  - Core/tasking tables use `user_id`.
  - Book/attachments/AI tables use `org_id` (mapped to `auth.users.id` in current schema).

## Module Flags
- `ADMIN_EMAIL` gates Knowledge export UI action to a single email when set (`src/app/knowledge/page.tsx`).
- `OPENAI_API_KEY` enables server AI calls; `/api/ai` still returns a scaffold response while book AI routes call OpenAI directly.
- `OPENAI_MODEL` optionally selects model name (defaults to `gpt-5.2` in current book AI routes).

## Testing
- Test runner: not configured in `package.json`.
- Lint: `npm run lint`.
- Current validation pattern implied by repo: local `dev`/manual smoke checks.

## Planned Feature Sets
- Home dashboard with Priority Matrix, Today view, Alignment banner.
- Tasks v2: categories, recurrence, "why" alignment field.
- Calendar module with recurring events and linkable items.
- Monthly Review + Survey + scoring + archive.
- Metrics dashboard (minimal, non-vanity).
