# Architecture

## Overview
- Next.js App Router with server components for data fetching.
- Route handlers (`route.ts`) for mutations.
- Tailwind CSS for UI.
- Supabase for Auth and Postgres with RLS.

## Data Access
- Server: `src/lib/supabase/server.ts` with `@supabase/ssr`.
- Client: `src/lib/supabase/client.ts` and `src/lib/supabaseClient.ts`.

## Auth Flow
- `/login` performs email/password sign-in and sign-up.
- `/auth/callback` exchanges auth code for a session.
- `middleware.ts` protects `/dashboard`, `/projects`, `/tasks`, `/notes`, `/knowledge`.

## Knowledge Export
- `POST /knowledge/export` writes markdown files to `vault/` under `notes/` and `knowledge/`.
