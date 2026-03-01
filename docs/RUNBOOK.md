# Runbook

## End-of-Day Shutdown Checklist
1. Ensure `supabase migration list` shows local/remote in sync.
2. Run `npm run build` locally if major UI changes landed.
3. Verify Vercel deployment is green (latest commit).
4. Check `/health` page and log in/out flow quickly.
5. Back up any active book work (export markdown/zip if needed).
6. If fitness module was just deployed, verify `supabase db push` was run to apply fitness tables.

## 1) Missing or invalid Supabase env vars
- Symptom:
  - App fails during startup/client creation, auth routes fail, or `/health` reports errors.
- Checks:
  - Confirm `.env.local` includes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Verify values match the intended Supabase project.
- Fix:
  - Correct env vars and restart the app (`npm run dev` or process restart in production).

## 2) Storage uploads/downloads failing for books or attachments
- Symptom:
  - Upload forms appear to submit but files are missing, or download returns 404.
- Checks:
  - Verify buckets `book_uploads` and `attachments` exist.
  - Confirm object path starts with authenticated user ID (policy requires `storage.foldername(name)[1] = auth.uid()::text`).
  - Check matching row exists in `book_uploads` or `attachments` table.
- Fix:
  - Re-apply migrations for bucket/policy creation.
  - Ensure handlers preserve user-prefixed storage path and authenticated session.

## 3) Vault export/import routes not working in runtime
- Symptom:
  - `/knowledge/export` or `/notes/[id]/export-vault` redirects without creating files; import finds nothing.
- Checks:
  - Confirm runtime supports Node filesystem writes.
  - Verify `vault/notes` and `vault/knowledge` are writable under app working directory.
  - Check server logs for FS permission/path errors.
- Fix:
  - Provide writable persistent storage or run these routes only in environments with local FS access.
  - Create missing directories and retry.

## 4) Fitness module not working (database tables missing)
- Symptom:
  - All fitness routes (`/fitness/*`) fail with database errors like "relation does not exist".
  - Fitness API routes return 500 errors.
- Checks:
  - Run `supabase migration list` and verify `20260225100000_fitness_module.sql` and `20260225100500_seed_exercises.sql` are applied.
  - Check logs for "relation 'public.workout_logs' does not exist" or similar.
- Fix:
  - Apply pending migrations: `supabase db push`
  - Or use the helper script: `npm run db:migrate:fitness`
  - Verify 16 fitness tables exist in Supabase dashboard.

## 5) Supabase migration history mismatch
- Symptom:
  - `supabase db push` or `supabase db pull` reports migration history mismatch or tries to reapply migrations already on remote.
- Checks:
  - Run `supabase migration list` and compare local vs remote IDs.
- Fix:
  - Use `supabase migration repair` to mark historical migrations as `applied` or `reverted` as appropriate.
  - Re-run `supabase db pull` to capture remote schema snapshot.
  - Re-run `supabase db push` to confirm clean state.

## 6) OpenAI API failures or rate limits
- Symptom:
  - AI features fail with 500 errors (book AI, sermon AI, fitness AI, morning briefing, lab analysis).
  - Error logs show "OpenAI API error" or rate limit messages.
  - Features timeout or return empty responses.
- Checks:
  - Verify `OPENAI_API_KEY` is set correctly in environment.
  - Check OpenAI dashboard for API usage/quota limits.
  - Review server logs for specific OpenAI error codes (429 = rate limit, 401 = invalid key).
  - Test a simple AI route like `/api/fitness/morning-briefing` to isolate the issue.
- Fix:
  - If missing key: Add `OPENAI_API_KEY` to environment and restart.
  - If rate limited: Wait for quota reset or upgrade OpenAI plan.
  - If invalid key: Generate new key from OpenAI dashboard.
  - If model not available: Check `OPENAI_MODEL` override and ensure model name is valid (defaults: `gpt-5.2` for books/sermons, `gpt-4o-mini` for fitness).
  - Consider adding retry logic or fallback models for production resilience.

## 7) Calendar scheduled workout issues (planned_workouts sync)
- Symptom:
  - Scheduled workout shows wrong time (e.g., 9am showing as 4am) or wrong day.
  - Scheduled workout can't be moved via calendar.
  - Calendar shows duplicate workout entries.
- Cause:
  - Scheduled workouts are source-of-truth in `planned_workouts`.
  - `calendar_events` rows for scheduled workouts are derived via Postgres trigger `sync_planned_workout_to_calendar()`.
  - Timezone handling must interpret (date + time) in **America/New_York** (ET).
- Fix:
  1. Ensure `sync_planned_workout_to_calendar()` interprets `(scheduled_date + scheduled_time)` using `AT TIME ZONE 'America/New_York'`.
  2. Resync existing `planned_workout:%` calendar rows from `planned_workouts`.
  3. In UI, edit scheduled workouts by PATCHing `/api/fitness/planned-workouts` (do not edit the derived calendar row).

## 8) Next.js Turbopack cache corruption (dev server crashes)
- Symptom:
  - Dev server crashes with "FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory".
  - After restart, errors like "Failed to restore task data (corrupted database or bug)" or "No such file or directory" for .sst files.
  - "Unable to acquire lock" or "Another write batch or compaction is already active" errors.
  - Missing build-manifest.json files.
- Checks:
  - Check server logs for Turbopack database corruption messages.
  - Verify `.next` directory exists and has corrupted cache files.
  - Check for lingering lock files at `.next/dev/lock`.
- Fix:
  1. Kill all Next.js dev processes: `ps aux | grep "[n]ext dev" | awk '{print $2}' | xargs kill -9`
  2. Kill processes on dev ports: `lsof -ti:3000,3001,3002 | xargs kill -9`
  3. Delete corrupted cache: `rm -rf .next`
  4. Remove lock file: `rm -f .next/dev/lock`
  5. Restart dev server: `npm run dev`
  - Note: First restart will show warning "Turbopack's filesystem cache has been deleted" - this is expected and normal.
