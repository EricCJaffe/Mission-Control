# Runbook

## 1) Supabase env vars missing
- Symptoms: Login fails, `/health` shows error, server throws "Missing NEXT_PUBLIC_SUPABASE_*".
- Checks: Verify `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Fix: Add the env vars and restart `npm run dev`.

## 2) Auth redirect loop or protected routes inaccessible
- Symptoms: Redirects to `/login` even when signed in.
- Checks: Confirm session cookies are set; verify `middleware.ts` is deployed; ensure Supabase URL/anon key are correct.
- Fix: Re-authenticate; clear cookies; confirm Supabase project keys.

## 3) Knowledge export fails
- Symptoms: Export button redirects but files are not written under `vault/`.
- Checks: Server logs for filesystem errors; confirm `vault/` exists and is writable.
- Fix: Create `vault/notes` and `vault/knowledge` locally; ensure the runtime supports filesystem writes.
