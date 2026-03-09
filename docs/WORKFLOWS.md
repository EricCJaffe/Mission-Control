# Workflows

## Local Development
- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Production build: `npm run build`
- Serve production build locally: `npm run start`

## Git Workflow
- Active release branch: `main`
- Before pushing, run at minimum:
  - `npm run build`
  - targeted lint if the change set is narrow, or `npm run lint` if broad
- `.claude/` stays local-only and should not be committed.

## Supabase Workflow
- Migrations live in `supabase/migrations/`
- Apply pending migrations: `supabase db push`
- Inspect alignment: `supabase migration list`
- If history diverges:
  - `supabase migration repair --status applied <ids...>`
  - `supabase db pull`
  - `supabase db push`

## Vercel Workflow
- Link project once with `vercel link`
- Pull environment locally with `vercel env pull .env.local`
- Production deploys build from GitHub `main`
- If local build passes and Vercel fails, compare the deployed commit SHA first

## Withings Workflow
- Configure a Withings developer app with the callback URL registered in `WITHINGS_CALLBACK_URL`
- Connect from `/fitness/settings/withings`
- First sync uses `initial` mode; later manual syncs use `incremental`
- Legacy CSV import remains available in the same screen for historical backfill
- Webhook subscription is not part of the current workflow

## Calendar / Planned Workout Workflow
- Source of truth: `planned_workouts`
- Derived calendar rows: `calendar_events` with `alignment_tag = planned_workout:<id>`
- Sync uses database triggers
- Scheduled times are interpreted in `America/New_York`

## Health File Workflow
- Uploads land in Supabase Storage and `health_file_uploads`
- Genetics, labs, and imaging flow into analysis routes and downstream health context
- Signed URL retrieval is used for source-PDF viewing

## Planning Workflow
- Health command center builds a persisted synthesis snapshot
- Suggested `health.md` updates are queued through the review workflow
- Training plans can be generated from AI-prepared intake, exported to PDF, and scheduled into planned workouts
