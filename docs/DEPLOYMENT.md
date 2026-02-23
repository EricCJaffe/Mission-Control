# Deployment

## Build and Start
- Build: `npm run build`
- Start: `npm run start`

## Required Runtime Configuration
- Required env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Feature-dependent env vars:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `ADMIN_EMAIL`

## Database and Storage Prerequisites
- Supabase migrations from `supabase/migrations/` must be applied for schema, RLS, and storage bucket policies.
- Storage buckets expected by app routes:
  - `book_uploads`
  - `attachments`
- If `supabase db pull` generates a new remote schema snapshot migration, commit it before deployment.

## Hosting Notes
- Root `README.md` references Vercel as a deployment option.
- No deployment pipeline config is checked in this repository.

## Runtime Constraints
- Routes that export/import to local `vault/` need writable filesystem access.
- If deploying to an environment without persistent local disk, disable or redesign those flows.

## Rollback
- No repo-specific rollback workflow is documented.
- Practical rollback path is to redeploy the previous app revision and revert/adjust migrations as needed.
