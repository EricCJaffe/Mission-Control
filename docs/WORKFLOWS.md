# Workflows

## Local Dev
- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Serve production build: `npm run start`

## Tests and Lint
- Test: not configured in `package.json`.
- Watch: not configured in `package.json`.
- Lint: `npm run lint`

## Data and Content Utilities
- Initialize standard docs context files:
  - `bash scripts/init-context.sh`
- Import an RTF manuscript into the books module:
  - `node scripts/import_book_from_rtf.mjs <path-to-rtf> [email]`
  - Requires env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Uses macOS `textutil` command (script dependency)

## Supabase Schema Workflow
- Migrations are stored in `supabase/migrations/`.
- No project-local scripted migration command is defined in `package.json`; apply via your Supabase CLI workflow.
- If migration history mismatches occur, use:
  - `supabase migration list`
  - `supabase migration repair --status applied <ids...>`
  - `supabase db pull`
  - `supabase db push`

## Deploy
- Primary deploy path in repo: `npm run build` then `npm run start`.
- Hosting note: root `README.md` references Vercel as an option.
- Runtime note: routes that write to local filesystem (`/knowledge/export`, `/notes/[id]/export-vault`) require writable server filesystem.
