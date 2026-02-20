# API

## Overview
- Internal route handlers are implemented in the Next.js App Router.

## Endpoints
- `POST /api/ai` (JSON)
  - Auth required. Returns a stub response unless `OPENAI_API_KEY` is set.
- `GET /auth/callback` (redirect)
  - Exchanges auth code for Supabase session.
- `POST /auth/signout` (redirect)
  - Clears Supabase session.
- `POST /projects/new` (redirect)
- `POST /tasks/new` (redirect)
- `POST /tasks/update` (redirect)
- `POST /notes/new` (redirect)
- `POST /notes/update` (redirect)
- `POST /knowledge/save` (redirect)
- `POST /knowledge/export` (redirect)
- `POST /knowledge/import` (redirect)
- `POST /dashboard/update` (redirect)
- `POST /dashboard/alignment` (redirect)
- `POST /dashboard/priorities` (redirect)
- `POST /dashboard/anchors` (redirect)
- `POST /dashboard/events` (redirect)

## Auth
- Supabase Auth via cookies; server routes call `supabase.auth.getUser()`.

## Errors
- Most endpoints redirect on error or unauthenticated access.
- `/api/ai` returns JSON with `{ ok: false, error }` and status `401` or `501` when missing `OPENAI_API_KEY`.
