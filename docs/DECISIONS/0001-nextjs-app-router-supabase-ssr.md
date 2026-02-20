# 0001 Next.js App Router + Supabase SSR

## Date
2026-02-20

## Status
Accepted

## Context
The product needs authenticated, per-user data access with minimal server plumbing while keeping the UI responsive and simple.

## Decision
Use Next.js App Router with server components and `@supabase/ssr` for server-side session handling and data access.

## Consequences
- Server components can fetch data securely using cookies.
- Middleware enforces auth on protected routes.
- Client code stays minimal and focused on UI.

## Links
- `src/lib/supabase/server.ts`
- `middleware.ts`
